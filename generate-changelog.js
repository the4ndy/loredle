const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion) {
    console.error("❌ Error: Please specify a version number. Example: npm run changelog 2.3.0");
    process.exit(1);
}

const changelogPath = path.join(__dirname, 'public', 'changelog.md');
const packagePath = path.join(__dirname, 'package.json');

const options = { timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric' };
const todayDate = new Intl.DateTimeFormat('en-US', options).format(new Date());

try {
    const latestTag = execSync('git describe --tags --abbrev=0').toString().trim();
    const commitHistory = execSync(`git log ${latestTag}..HEAD --format=%B`).toString();
    const lines = commitHistory.split('\n').map(line => line.trim());

    const categories = { features: [], qol: [], fixes: [] };
    let currentItem = null;

    lines.forEach(line => {
        if (!line) return;
        const lowerLine = line.toLowerCase();

        if (lowerLine.startsWith('feat:')) {
            currentItem = { title: line.replace(/^feat:\s*/i, '').trim(), subItems: [] };
            categories.features.push(currentItem);
        } else if (lowerLine.startsWith('qol:')) {
            currentItem = { title: line.replace(/^qol:\s*/i, '').trim(), subItems: [] };
            categories.qol.push(currentItem);
        } else if (lowerLine.startsWith('fix:')) {
            currentItem = { title: line.replace(/^fix:\s*/i, '').trim(), subItems: [] };
            categories.fixes.push(currentItem);
        } else if (currentItem) {
            currentItem.subItems.push(line);
        }
    });

    if (!categories.features.length && !categories.qol.length && !categories.fixes.length) {
        console.log("⚠️ No changelog lines matching feat:, qol:, or fix: were found since the last tag.");
        process.exit(0);
    }

    let markdownUpdate = `# v${newVersion} - ${todayDate}\n\n`;

    const formatItems = (items, sectionTitle) => {
        if (!items.length) return '';
        let sectionStr = `### ${sectionTitle}\n`;
        items.forEach(item => {
            const splitIndex = item.title.indexOf(':');
            if (splitIndex > 0 && splitIndex < 35) {
                const name = item.title.substring(0, splitIndex).trim();
                const desc = item.title.substring(splitIndex + 1).trim();
                sectionStr += `* **${name}:** ${desc}\n`;
            } else {
                sectionStr += `* **${item.title}**\n`;
            }
            item.subItems.forEach(sub => { sectionStr += `  * *${sub}*\n`; });
        });
        return sectionStr + `\n`;
    };

    markdownUpdate += formatItems(categories.features, "✨ Gameplay & Features");
    markdownUpdate += formatItems(categories.qol, "🛠️ Quality of Life");
    markdownUpdate += formatItems(categories.fixes, "🐛 Bug Fixes");
    markdownUpdate += `---\n\n`;

    // Update Markdown
    const currentChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
    fs.writeFileSync(changelogPath, markdownUpdate + currentChangelog);

    // Update package.json version
    if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        pkg.version = newVersion;
        fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    }

    console.log(`✅ Generated v${newVersion} in public/changelog.md`);
    console.log(`✅ Bumped package.json to v${newVersion}\n`);
    console.log(`NEXT STEPS:`);
    console.log(`1. Open changelog.md and add your narrative summary sentence.`);
    console.log(`2. Run: npm run release:finish`);

} catch (error) {
    console.error("❌ An error occurred:", error.message);
}