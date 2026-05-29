import fs from 'fs';

fs.readFile('src/app/listener-directory/page.tsx', 'utf8', (err, data) => {
  if (err) throw err;

  // Fix main header logo (around line 1913-1914)
  let result = data.replace(
    'w-8.5 h-8.5 rounded-lg bg-white border border-white/10 flex items-center justify-center p-1 shadow-md',
    'w-12 h-12 rounded-xl bg-white border border-white/10 flex items-center justify-center p-1.5 shadow-md'
  );

  // Change object-contain to object-cover for header logo
  result = result.replace(
    '<img src="/logo.png" alt="AirCue Logo" className="w-full h-full object-contain" />',
    '<img src="/logo.png" alt="AirCue Logo" className="w-full h-full object-cover" />'
  );

  // Change the mobile sidebar header logo too (same pattern)
  result = result.replace(
    '<img src="/logo.png" alt="AirCue Logo" className="w-full h-full object-contain" />',
    '<img src="/logo.png" alt="AirCue Logo" className="w-full h-full object-cover" />'
  );

  fs.writeFile('src/app/listener-directory/page.tsx', result, (err) => {
    if (err) throw err;
    console.log('Done');
  });
});