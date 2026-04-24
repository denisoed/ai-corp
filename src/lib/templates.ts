import { CompanyTemplate } from '../types';

export const COMPANY_TEMPLATES: CompanyTemplate[] = [
  {
    id: 'software-dev',
    name: 'Software Development Team',
    description: 'A full Agile team ready to build software products from scratch.',
    agents: [
      { name: 'CEO Bot', role: 'Manager', model: 'GPT-4', description: 'Overall project architect and CEO.', skills: ['Leadership'] }, // 0
      { name: 'Alpha PM', role: 'Manager', model: 'OpenClaw', description: 'Product Manager managing tasks and unblocking devs.', skills: ['Agile', 'Scrum'], parentIndex: 0 }, // 1
      { name: 'DevBot V3', role: 'Developer', model: 'Codex', description: 'Full-stack Developer generating React and Node.js code.', skills: ['TypeScript', 'React'], parentIndex: 1 }, // 2
      { name: 'Sec-Reviewer', role: 'Reviewer', model: 'Claude CLI', description: 'QA and Code Reviewer hunting for security bugs.', skills: ['Testing', 'Security'], parentIndex: 2 }, // 3
      { name: 'Infra Bot', role: 'DevOps', model: 'GPT-DevOps', description: 'Manages CI/CD and cloud infrastructure deployments.', skills: ['Docker', 'AWS', 'Pipelines'], parentIndex: 1 } // 4
    ],
    tasks: [
      { title: 'Project Kickoff', description: 'Define the roadmap and system architecture.', status: 'In Progress', priority: 'High', tags: ['Planning'], assigneeIndex: 0, subtasks: ['Write vision doc', 'Approve architecture', 'Allocate budget'] },
      { title: 'Setup Repository', description: 'Initialize Git repo, linters, and build pipelines.', status: 'Planned', priority: 'Medium', tags: ['DevOps'], assigneeIndex: 4, subtasks: ['Create GitHub repo', 'Configure ESLint/Prettier', 'Set up GitHub Actions'] },
      { title: 'Implement Auth API', description: 'Create JWT based authentication service.', status: 'Backlog', priority: 'High', tags: ['Backend'], assigneeIndex: 2, subtasks: ['Design DB Schema', 'Implement JWT signing', 'Write endpoint tests'] }
    ]
  },
  {
    id: 'marketing-agency',
    name: 'Digital Marketing Agency',
    description: 'A creative team specialized in content, SEO, and social media design.',
    agents: [
      { name: 'Director AI', role: 'Manager', model: 'GPT-4', description: 'Marketing Director.', skills: ['Leadership', 'CMO'] }, // 0
      { name: 'Strategist X', role: 'Manager', model: 'OpenClaw', description: 'Plans marketing campaigns and SEO strategy.', skills: ['Strategy', 'SEO'], parentIndex: 0 }, // 1
      { name: 'CopyWriter AI', role: 'Analyst', model: 'Claude Creator', description: 'Writes blog posts and social media copy.', skills: ['Writing', 'PR'], parentIndex: 1 }, // 2
      { name: 'DesignGen', role: 'Designer', model: 'Midjourney', description: 'Generates banners and creative assets.', skills: ['Design', 'Figma'], parentIndex: 1 } // 3
    ],
    tasks: [
      { title: 'Brand Identity Kit', description: 'Compile brand colors, logo concepts, and fonts into a kit.', status: 'In Progress', priority: 'High', tags: ['Design'], assigneeIndex: 3, subtasks: ['Color palette', 'Typography scale', 'Logo variants'] },
      { title: 'Competitor Analysis', description: 'Analyze 3 main competitors in the niche.', status: 'Planned', priority: 'Medium', tags: ['SEO'], assigneeIndex: 1, subtasks: ['Identify top 3', 'Matrix comparison', 'SWOT summary'] },
      { title: 'Draft Promo Post', description: 'Write 3 variants for Twitter promo campaign.', status: 'Backlog', priority: 'Medium', tags: ['Copy'], assigneeIndex: 2, subtasks: ['Hook variation A', 'Hook variation B', 'CTA testing'] }
    ]
  },
  {
    id: 'data-science',
    name: 'Data Science & BI',
    description: 'A dedicated team to process data, train ML models, and create reports.',
    agents: [
      { name: 'Data Lead', role: 'Manager', model: 'OpenClaw', description: 'Data Science Manager coordinating experiments.', skills: ['Management', 'Data Strategy'] }, // 0
      { name: 'PyWorker', role: 'Developer', model: 'Codex ML', description: 'Python developer for ML pipelines operations.', skills: ['Python', 'Pandas', 'TensorFlow'], parentIndex: 0 }, // 1
      { name: 'Data Insights', role: 'Analyst', model: 'Claude Analyst', description: 'Data analyst pulling insights and visualizing.', skills: ['SQL', 'Tableau', 'Stats'], parentIndex: 0 } // 2
    ],
    tasks: [
      { title: 'Data Cleaning Script', description: 'Cleanse the initial dataset removing nulls and outliers.', status: 'In Progress', priority: 'High', tags: ['Python', 'Preparation'], assigneeIndex: 1, subtasks: ['Drop NaNs', 'Normalize numerical fields', 'Export standard format'] },
      { title: 'Dashboard Mockup', description: 'Design the layout for the executive BI dashboard.', status: 'Planned', priority: 'Medium', tags: ['Visualization'], assigneeIndex: 2, subtasks: ['Gather metrics', 'Wireframe layout', 'Select chart types'] },
      { title: 'Model Evaluation', description: 'Select the best KPI to measure the ML model accuracy.', status: 'Backlog', priority: 'High', tags: ['Research'], assigneeIndex: 0, subtasks: ['Review F1 scores', 'Calculate false positives', 'Finalize metrics'] }
    ]
  }
];
