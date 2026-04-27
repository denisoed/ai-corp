import { CompanyTemplate } from '../types';

export const COMPANY_TEMPLATES: CompanyTemplate[] = [
  {
    id: 'software-dev',
    name: 'Software Development Team',
    description: 'A full Agile team ready to build software products from scratch.',
    agents: [
      { name: 'CEO Bot', role: 'Manager', skills: ['Leadership', 'Architecture', 'Strategy'] }, // 0
      { name: 'Alpha PM', role: 'Manager', skills: ['Agile', 'Scrum', 'Product'], parentIndex: 0 }, // 1
      { name: 'DevBot V3', role: 'Developer', skills: ['TypeScript', 'React', 'Node.js'], parentIndex: 1 }, // 2
      { name: 'Sec-Reviewer', role: 'Reviewer', skills: ['Testing', 'Security', 'Code Review'], parentIndex: 2 }, // 3
      { name: 'Infra Bot', role: 'DevOps', skills: ['Docker', 'AWS', 'CI/CD'], parentIndex: 1 } // 4
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
      { name: 'Director AI', role: 'Manager', skills: ['Leadership', 'Marketing'] }, // 0
      { name: 'Strategist X', role: 'Manager', skills: ['Strategy', 'SEO'], parentIndex: 0 }, // 1
      { name: 'CopyWriter AI', role: 'Analyst', skills: ['Writing', 'PR', 'Copy'], parentIndex: 1 }, // 2
      { name: 'DesignGen', role: 'Designer', skills: ['Design', 'Figma', 'Social Media'], parentIndex: 1 } // 3
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
      { name: 'Data Lead', role: 'Manager', skills: ['Management', 'Data Strategy'] }, // 0
      { name: 'PyWorker', role: 'Developer', skills: ['Python', 'Pandas', 'TensorFlow'], parentIndex: 0 }, // 1
      { name: 'Data Insights', role: 'Analyst', skills: ['SQL', 'Tableau', 'Stats'], parentIndex: 0 } // 2
    ],
    tasks: [
      { title: 'Data Cleaning Script', description: 'Cleanse the initial dataset removing nulls and outliers.', status: 'In Progress', priority: 'High', tags: ['Python', 'Preparation'], assigneeIndex: 1, subtasks: ['Drop NaNs', 'Normalize numerical fields', 'Export standard format'] },
      { title: 'Dashboard Mockup', description: 'Design the layout for the executive BI dashboard.', status: 'Planned', priority: 'Medium', tags: ['Visualization'], assigneeIndex: 2, subtasks: ['Gather metrics', 'Wireframe layout', 'Select chart types'] },
      { title: 'Model Evaluation', description: 'Select the best KPI to measure the ML model accuracy.', status: 'Backlog', priority: 'High', tags: ['Research'], assigneeIndex: 0, subtasks: ['Review F1 scores', 'Calculate false positives', 'Finalize metrics'] }
    ]
  }
];
