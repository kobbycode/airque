const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();
const ACTIVE_WINDOW_MS = 60 * 1000;

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
