import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME;

if (!token || !username) {
  throw new Error("GITHUB_TOKEN and GITHUB_USERNAME are required");
}

const to = new Date();
const from = new Date(to);
from.setUTCDate(from.getUTCDate() - 364);

const query = `
  query ContributionStats($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              contributionLevel
              date
              weekday
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "user-agent": `${username}-profile-readme`,
  },
  body: JSON.stringify({
    query,
    variables: { login: username, from: from.toISOString(), to: to.toISOString() },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const calendar = payload.data.user.contributionsCollection.contributionCalendar;
const weeks = calendar.weeks;
const days = weeks.flatMap((week) => week.contributionDays).sort((a, b) => a.date.localeCompare(b.date));
const activeDays = days.filter((day) => day.contributionCount > 0).length;

let longestStreak = 0;
let runningStreak = 0;
for (const day of days) {
  runningStreak = day.contributionCount > 0 ? runningStreak + 1 : 0;
  longestStreak = Math.max(longestStreak, runningStreak);
}

let currentStreak = 0;
let index = days.length - 1;
if (days[index]?.contributionCount === 0) index -= 1;
while (index >= 0 && days[index].contributionCount > 0) {
  currentStreak += 1;
  index -= 1;
}

const colors = {
  NONE: "#161b22",
  FIRST_QUARTILE: "#0e4429",
  SECOND_QUARTILE: "#006d32",
  THIRD_QUARTILE: "#26a641",
  FOURTH_QUARTILE: "#39d353",
};

const cells = weeks.flatMap((week, weekIndex) =>
  week.contributionDays.map((day) => {
    const fill = colors[day.contributionLevel] ?? colors.NONE;
    const x = 50 + weekIndex * 12.35;
    const y = 196 + day.weekday * 12.35;
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="9.5" height="9.5" rx="2" fill="${fill}"><title>${day.date}: ${day.contributionCount} contributions</title></rect>`;
  }),
).join("");

const metrics = [
  [calendar.totalContributions.toLocaleString("en-US"), "TOTAL CONTRIBUTIONS"],
  [currentStreak.toLocaleString("en-US"), "CURRENT STREAK"],
  [longestStreak.toLocaleString("en-US"), "LONGEST STREAK"],
  [activeDays.toLocaleString("en-US"), "ACTIVE DAYS"],
];

const metricMarkup = metrics.map(([value, label], metricIndex) => {
  const x = 70 + metricIndex * 180;
  return `<g transform="translate(${x} 0)">
    <text x="0" y="104" text-anchor="middle" class="value">${value}</text>
    <text x="0" y="128" text-anchor="middle" class="label">${label}</text>
  </g>`;
}).join("");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="310" viewBox="0 0 760 310" role="img" aria-labelledby="title desc">
  <title id="title">${username}'s yearly contribution statistics</title>
  <desc id="desc">${calendar.totalContributions} total contributions, ${currentStreak} day current streak, ${longestStreak} day longest streak, and ${activeDays} active days.</desc>
  <defs>
    <linearGradient id="edge" x1="0" x2="1"><stop stop-color="#58a6ff"/><stop offset=".5" stop-color="#a371f7"/><stop offset="1" stop-color="#3fb950"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <style>
      text { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
      .value { fill:#f0f6fc; font-size:28px; font-weight:700; }
      .label { fill:#8b949e; font-size:10px; letter-spacing:1.2px; }
      .heading { fill:#58a6ff; font-size:15px; font-weight:700; letter-spacing:1.5px; }
    </style>
  </defs>
  <rect x="2" y="2" width="756" height="306" rx="14" fill="#0d1117" stroke="url(#edge)" stroke-width="2"/>
  <circle cx="25" cy="23" r="5" fill="#ff5f56"/><circle cx="44" cy="23" r="5" fill="#ffbd2e"/><circle cx="63" cy="23" r="5" fill="#27c93f"/>
  <text x="380" y="29" text-anchor="middle" class="heading" filter="url(#glow)">YEARLY PLAYER STATS</text>
  <path d="M24 47H736" stroke="#30363d"/>
  ${metricMarkup}
  <text x="50" y="176" fill="#8b949e" font-size="11">LAST 365 DAYS</text>
  ${cells}
  <text x="710" y="292" text-anchor="end" fill="#484f58" font-size="10">updated ${to.toISOString().slice(0, 10)}</text>
</svg>`;

await mkdir("dist", { recursive: true });
await writeFile("dist/contribution-stats.svg", svg, "utf8");
console.log(`Generated contribution card with ${calendar.totalContributions} contributions`);
