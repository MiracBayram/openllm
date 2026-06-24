const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'components');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  if (content.includes('lucide-react')) {
    // Replace import
    const importRegex = /import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"];/;
    const match = content.match(importRegex);
    if (match) {
      const icons = match[1].split(',').map(s => s.trim());
      
      // Calculate relative path for Icon.tsx
      const relPath = file === 'CodeBlock.tsx' ? './ui/Icon' : './ui/Icon'; // since all are in components dir
      
      content = content.replace(importRegex, `import { $1 } from 'lucide';\nimport { Icon } from '${relPath}';`);
      
      // Replace JSX usages
      for (const icon of icons) {
        if (!icon) continue;
        const jsxRegex = new RegExp(`<${icon}([^>]*?)(/?)>`, 'g');
        content = content.replace(jsxRegex, (m, attrs, selfClose) => {
          // If it's self closing or not, it should be self closing for Icons
          return `<Icon icon={${icon}}${attrs}/>`;
        });
        
        // Also check closing tags if any (lucide icons shouldn't have children but just in case)
        const closeRegex = new RegExp(`</${icon}>`, 'g');
        content = content.replace(closeRegex, `</Icon>`);
      }
      
      fs.writeFileSync(filePath, content);
      console.log(`Refactored ${file}`);
    }
  }
}
