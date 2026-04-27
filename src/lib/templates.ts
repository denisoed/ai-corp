import { CompanyTemplate } from '../types';

export const COMPANY_TEMPLATES: CompanyTemplate[] = [
  {
    id: 'software-dev',
    name: 'Software Development Team',
    description: 'A full Agile team ready to build software products from scratch.',
    agents: [
      { name: 'CEO Bot', slug: 'ceo-bot', role: 'Manager', skills: ['Leadership', 'Architecture', 'Strategy'] }, // 0
      { name: 'Alpha PM', slug: 'alpha-pm', role: 'Manager', skills: ['Agile', 'Scrum', 'Product'] },
      { name: 'DevBot V3', slug: 'devbot-v3', role: 'Developer', skills: ['TypeScript', 'React', 'Node.js'] },
      { name: 'Sec-Reviewer', slug: 'sec-reviewer', role: 'Reviewer', skills: ['Testing', 'Security', 'Code Review'] },
      { name: 'Infra Bot', slug: 'infra-bot', role: 'DevOps', skills: ['Docker', 'AWS', 'CI/CD'] }
    ],
    tasks: [
      { title: 'Project Kickoff', description: 'Define the roadmap and system architecture.', status: 'In Progress', priority: 'High', tags: ['Planning'], subtasks: ['Write vision doc', 'Approve architecture', 'Allocate budget'] },
      { title: 'Setup Repository', description: 'Initialize Git repo, linters, and build pipelines.', status: 'Planned', priority: 'Medium', tags: ['DevOps'], subtasks: ['Create GitHub repo', 'Configure ESLint/Prettier', 'Set up GitHub Actions'] },
      { title: 'Implement Auth API', description: 'Create JWT based authentication service.', status: 'Backlog', priority: 'High', tags: ['Backend'], subtasks: ['Design DB Schema', 'Implement JWT signing', 'Write endpoint tests'] }
    ]
  },
  {
    id: 'marketing-agency',
    name: 'Digital Marketing Agency',
    description: 'A creative team specialized in content, SEO, and social media design.',
    agents: [
      { name: 'Director AI', slug: 'director-ai', role: 'Manager', skills: ['Leadership', 'Marketing'] }, // 0
      { name: 'Strategist X', slug: 'strategist-x', role: 'Manager', skills: ['Strategy', 'SEO'] },
      { name: 'CopyWriter AI', slug: 'copywriter-ai', role: 'Analyst', skills: ['Writing', 'PR', 'Copy'] },
      { name: 'DesignGen', slug: 'designgen', role: 'Designer', skills: ['Design', 'Figma', 'Social Media'] }
    ],
    tasks: [
      { title: 'Brand Identity Kit', description: 'Compile brand colors, logo concepts, and fonts into a kit.', status: 'In Progress', priority: 'High', tags: ['Design'], subtasks: ['Color palette', 'Typography scale', 'Logo variants'] },
      { title: 'Competitor Analysis', description: 'Analyze 3 main competitors in the niche.', status: 'Planned', priority: 'Medium', tags: ['SEO'], subtasks: ['Identify top 3', 'Matrix comparison', 'SWOT summary'] },
      { title: 'Draft Promo Post', description: 'Write 3 variants for Twitter promo campaign.', status: 'Backlog', priority: 'Medium', tags: ['Copy'], subtasks: ['Hook variation A', 'Hook variation B', 'CTA testing'] }
    ]
  },
  {
    id: 'data-science',
    name: 'Data Science & BI',
    description: 'A dedicated team to process data, train ML models, and create reports.',
    agents: [
      { name: 'Data Lead', slug: 'data-lead', role: 'Manager', skills: ['Management', 'Data Strategy'] }, // 0
      { name: 'PyWorker', slug: 'pyworker', role: 'Developer', skills: ['Python', 'Pandas', 'TensorFlow'] },
      { name: 'Data Insights', slug: 'data-insights', role: 'Analyst', skills: ['SQL', 'Tableau', 'Stats'] }
    ],
    tasks: [
      { title: 'Data Cleaning Script', description: 'Cleanse the initial dataset removing nulls and outliers.', status: 'In Progress', priority: 'High', tags: ['Python', 'Preparation'], subtasks: ['Drop NaNs', 'Normalize numerical fields', 'Export standard format'] },
      { title: 'Dashboard Mockup', description: 'Design the layout for the executive BI dashboard.', status: 'Planned', priority: 'Medium', tags: ['Visualization'], subtasks: ['Gather metrics', 'Wireframe layout', 'Select chart types'] },
      { title: 'Model Evaluation', description: 'Select the best KPI to measure the ML model accuracy.', status: 'Backlog', priority: 'High', tags: ['Research'], subtasks: ['Review F1 scores', 'Calculate false positives', 'Finalize metrics'] }
    ]
  }
];
