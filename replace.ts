import fs from 'fs';
import path from 'path';

const files = [
  'src/components/views/Dashboard.tsx',
  'src/components/views/AgentsList.tsx',
  'src/components/views/TaskBoard.tsx',
  'src/components/views/ActivityLogs.tsx'
];

files.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace(/neutral/g, 'zinc');
    fs.writeFileSync(filePath, content);
    console.log(`Replaced in ${file}`);
  }
});
