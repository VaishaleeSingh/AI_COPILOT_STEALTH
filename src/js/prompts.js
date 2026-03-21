export const RESUME = `
Name: Vaishalee Singh
Email: vaishalisinghsln5@gmail.com | Phone: +91-6394531994

OBJECTIVE:
Frontend Developer experienced in building scalable web applications using React, Next.js and modern JavaScript frameworks. Passionate about building high-performance UI systems and integrating AI-powered features into modern web platforms.

TECHNICAL SKILLS:
- Languages: JavaScript (ES6+), TypeScript, HTML5, CSS3, Java, C++
- Frameworks & Libraries: React.js, Next.js, Redux Toolkit, Zustand, React Query, React Router
- Styling: Tailwind CSS, Bootstrap, Responsive Design, CSS3
- Tools: Git, Node.js, Strapi CMS, Mixpanel, Netlify, Render, Jira
- Databases: MongoDB, MySQL
- Concepts: REST APIs, JWT Authentication, SSG/SSR, Agile Development, CI/CD, Data Structures & Algorithms

EXPERIENCE:
RUH AI – Frontend Intern (Nov 2025 – Present)
- Developed scalable frontend components using React, Tailwind CSS and modern state management.
- Architected Redux + Zustand state management layer improving rendering performance.
- Integrated Strapi CMS for dynamic content management.
- Implemented Mixpanel analytics to capture user behavior and feature usage.

PROJECTS:
1. ModuMentor – Agent Mediated Business Process Automation
   - Built full-stack AI automation platform achieving 27% higher accuracy and improved reliability.
   - Integrated multiple APIs including Gmail, Google Sheets, Tavily and OpenWeather.
   - Developed scalable backend services using Node.js and Flask.

2. AI Copilot Stealth – AI Interview Assistant
   - Developed Electron desktop application providing real-time AI assistance during technical interviews.
   - Implemented stealth mode preventing screen capture via OS-level protection APIs.
   - Integrated Groq Llama, Gemini and Tavily AI models for query processing.
   - Built voice transcription pipeline using AssemblyAI.
   - Optimized AI response latency to under 2 seconds.

3. Digital Recruitment Management System
   - Developed full-stack MERN recruitment platform with JWT authentication.
   - Implemented ATS resume parsing and analytics dashboard.
   - Built interview scheduling and candidate tracking system.

CERTIFICATIONS:
- Frontend Developer Certification – Micro1 (March 10, 2026) — passed AI-evaluated technical interview.

EDUCATION:
- B.Tech Computer Science and Engineering, Amity University UP (2022–2026), CGPA: 8.22/10
- Senior Secondary (CBSE), Stella Maris Convent School (2021) – 89.4%
- Secondary (CBSE), Stella Maris Convent School (2019) – 92%

LANGUAGES: English, Hindi
`;

export const SYSTEM_PROMPTS = {
  general: `You are a helpful interview coach.
Give a concise, very simple, natural-sounding answer that a normal person would actually say aloud.
Use plain, everyday language without complex jargon.
Keep it 3-4 sentences. Sound friendly and human, not robotic.`,

  behavioral: `You are a helpful interview coach.
Answer using a simple STAR method (Situation, Task, Action, Result).
Use very simple, conversational language as if you are talking to a friend.
Keep it natural, spoken, and about 4-5 sentences.`,

  technical: `You are a friendly engineer helping with an interview.
Give a clear technical answer but explain it in very simple, plain English first.
Do not use overly complex or formal words. Explain it as simply as possible.
Include an easy-to-understand example. Keep it focused to 4-6 sentences.`,

  hr: `You are a helpful career coach.
Give very simple, confident advice. Use plain English that is easy to speak aloud.
For salary questions, give a safe range. Keep it 3-4 sentences.`,

  introduction: `You are an interview coach helping a candidate introduce themselves.
Use ONLY the resume details provided to craft a natural, confident spoken introduction.
Keep it 4-6 sentences. Sound warm, professional and human — not like a robot reading a CV.
Do NOT add skills or experience not mentioned in the resume.
End with one sentence about being excited for this opportunity.`,
};
