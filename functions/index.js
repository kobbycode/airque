const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1' });

const db = admin.firestore();
const ACTIVE_WINDOW_MS = 60 * 1000;

// ─── YouTube Live Status Config ────────────────────────────────────────────
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || 'AIzaSyDFbhYOuWOqUJrj-zCcCi_6Lgf3-xC5quc';

function activeCutoff() {
  return admin.firestore.Timestamp.fromMillis(Date.now() - ACTIVE_WINDOW_MS);
}

async function aggregateStationListeners(stationId) {
  if (!stationId) return;

  const snap = await db.collection('listenerSessions')
    .where('stationId', '==', stationId)
    .where('state', '==', 'active')
    .where('lastSeen', '>=', activeCutoff())
    .get();

  await db.collection('stationListeners').doc(stationId).set({
    count: snap.size,
    source: 'live',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

exports.aggregateListenerSession = onDocumentWritten('listenerSessions/{sessionId}', async (event) => {
  const before = event.data.before.exists ? event.data.before.data() : null;
  const after = event.data.after.exists ? event.data.after.data() : null;
  const stationIds = new Set();

  if (before && before.stationId) stationIds.add(before.stationId);
  if (after && after.stationId) stationIds.add(after.stationId);

  await Promise.all([...stationIds].map(aggregateStationListeners));
});

exports.expireStaleListenerSessions = onSchedule('every 1 minutes', async () => {
  const staleSnap = await db.collection('listenerSessions')
    .where('state', '==', 'active')
    .where('lastSeen', '<', activeCutoff())
    .limit(500)
    .get();

  if (staleSnap.empty) return;

  const stationIds = new Set();
  const batch = db.batch();

  staleSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (data.stationId) stationIds.add(data.stationId);
    batch.set(doc.ref, {
      state: 'stale',
      endedAt: admin.firestore.FieldValue.serverTimestamp(),
      endReason: 'heartbeat-timeout',
    }, { merge: true });
  });

  await batch.commit();
  await Promise.all([...stationIds].map(aggregateStationListeners));
});

// ─── YouTube Live Notification Function ───────────────────────────────────
/**
 * Runs every 5 minutes.
 * For each YouTube channel that has subscribers, checks if it just went live.
 * If a channel transitioned from offline → live, sends FCM push to all subscribers.
 */
exports.checkYouTubeLiveAndNotify = onSchedule('every 5 minutes', async () => {
  if (!YOUTUBE_API_KEY) {
    console.warn('YOUTUBE_API_KEY not set, skipping live check');
    return;
  }

  // 1. Get all YouTube channels from Firestore
  const channelsSnap = await db.collection('youtubeChannels').get();
  if (channelsSnap.empty) return;

  const https = require('https');

  function fetchJson(url) {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
  }

  for (const channelDoc of channelsSnap.docs) {
    const channel = channelDoc.data();
    const channelId = channel.channelId;
    const channelName = channel.name;

    if (!channelId) continue;

    // 2. Check if this channel has any subscribers
    const subsSnap = await db.collection('channelSubscriptions').doc(channelId)
      .collection('tokens').limit(1).get();
    if (subsSnap.empty) continue;

    // 3. Check YouTube live status
    let isLive = false;
    let videoId = null;
    let videoTitle = null;

    try {
      const liveData = await fetchJson(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&eventType=live&key=${YOUTUBE_API_KEY}`
      );
      const liveItem = liveData.items?.[0];
      isLive = !!liveItem;
      videoId = liveItem?.id?.videoId || null;
      videoTitle = liveItem?.snippet?.title || null;
    } catch (err) {
      console.error(`Failed to check live status for ${channelName}:`, err);
      continue;
    }

    // 4. Compare with last known state in Firestore
    const stateRef = db.collection('channelLiveState').doc(channelId);
    const stateSnap = await stateRef.get();
    const prevState = stateSnap.exists ? stateSnap.data() : { isLive: false };

    // 5. Only notify on transition: offline → live
    if (isLive && !prevState.isLive) {
      console.log(`${channelName} just went LIVE — sending notifications`);

      // Get all subscriber tokens
      const allTokensSnap = await db.collection('channelSubscriptions').doc(channelId)
        .collection('tokens').get();

      const tokens = allTokensSnap.docs.map(d => d.data().token).filter(Boolean);
      if (tokens.length === 0) continue;

      // Send FCM multicast
      const message = {
        notification: {
          title: `🔴 ${channelName} is LIVE!`,
          body: videoTitle || `${channelName} has just started streaming. Tap to watch now.`,
        },
        data: {
          channelId,
          channelName,
          videoId: videoId || '',
          type: 'live_started',
        },
        tokens,
      };

      try {
        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`Sent ${response.successCount}/${tokens.length} notifications for ${channelName}`);

        // Clean up invalid tokens
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error?.code;
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
              invalidTokens.push(tokens[idx]);
            }
          }
        });

        if (invalidTokens.length > 0) {
          const cleanBatch = db.batch();
          for (const token of invalidTokens) {
            cleanBatch.delete(
              db.collection('channelSubscriptions').doc(channelId).collection('tokens').doc(token)
            );
          }
          await cleanBatch.commit();
          console.log(`Cleaned ${invalidTokens.length} stale tokens`);
        }
      } catch (err) {
        console.error('FCM send error:', err);
      }
    }

    // 6. Update state
    await stateRef.set({
      isLive,
      videoId: videoId || null,
      videoTitle: videoTitle || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
});
