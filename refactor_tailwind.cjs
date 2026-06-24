const fs = require('fs');
const path = require('path');

const map = {
  // Backgrounds
  'bg-zinc-950': 'bg-forge-bg',
  'bg-black': 'bg-forge-bg',
  'bg-zinc-900': 'bg-forge-surface',
  'bg-gray-900': 'bg-forge-surface',
  'bg-zinc-800': 'bg-forge-surface-2',
  'bg-gray-800': 'bg-forge-surface-2',
  'bg-zinc-700': 'bg-forge-surface-3',
  'bg-gray-700': 'bg-forge-surface-3',

  // Borders
  'border-zinc-800': 'border-forge-border',
  'border-gray-800': 'border-forge-border',
  'border-white/10': 'border-forge-border',

  // Text Colors
  'text-white': 'text-forge-text',
  'text-zinc-100': 'text-forge-text',
  'text-zinc-200': 'text-forge-text',
  'text-zinc-300': 'text-forge-text-secondary',
  'text-zinc-400': 'text-forge-text-secondary',
  'text-gray-400': 'text-forge-text-secondary',
  'text-zinc-500': 'text-forge-text-muted',
  'text-gray-500': 'text-forge-text-muted',

  // Accents (Bg)
  'bg-indigo-500': 'bg-forge-accent',
  'bg-indigo-600': 'bg-forge-accent',
  'bg-cyan-600': 'bg-forge-accent',
  'hover:bg-indigo-600': 'hover:bg-forge-accent-hover',
  'hover:bg-indigo-500': 'hover:bg-forge-accent-hover',
  'hover:bg-cyan-500': 'hover:bg-forge-accent-hover',

  // Accents (Text/Border)
  'text-indigo-400': 'text-forge-accent',
  'text-indigo-500': 'text-forge-accent',
  'text-cyan-400': 'text-forge-accent',
  'hover:text-indigo-400': 'hover:text-forge-accent-hover',
  'border-indigo-500': 'border-forge-accent',
  'hover:border-indigo-500': 'hover:border-forge-accent-hover',
  'focus:border-indigo-500/50': 'focus:border-forge-accent',
  'focus:border-cyan-500': 'focus:border-forge-accent',

  // Danger
  'text-red-500': 'text-forge-danger',
  'text-rose-500': 'text-forge-danger',
  'bg-red-500': 'bg-forge-danger',
  'bg-rose-500': 'bg-forge-danger',
  'hover:bg-rose-500/20': 'hover:bg-forge-danger-bg',
  'text-danger-400': 'text-forge-danger',
  'hover:border-rose-500/30': 'hover:border-forge-danger',

  // Typography
  'font-bold': 'font-semibold'
};

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkDir(file));
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

const files = walkDir(path.join(__dirname, 'src'));

let changedFiles = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content;

  // We replace on whole word boundaries to avoid replacing "text-white-something" if it existed,
  // but tailwind classes usually don't have partial matches like that unless hyphenated further.
  // Actually, standard split and join is safer for exact matches, but regex with lookarounds is better.
  
  for (const [oldClass, newClass] of Object.entries(map)) {
    // Escape characters for regex (like / in border-white/10)
    const escapedOld = oldClass.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(?<![\\w-])` + escapedOld + `(?![\\w-])`, 'g');
    newContent = newContent.replace(regex, newClass);
  }

  if (newContent !== content) {
    fs.writeFileSync(file, newContent);
    console.log(`Updated ${file}`);
    changedFiles++;
  }
}

console.log(`Done. Changed ${changedFiles} files.`);
