const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const newVersion = process.argv[2];
if (!newVersion) {
    console.error("❌ Error: Please specify a version number. Example: npm run changelog 2.3.0");
    process.exit(1);
}

const changelogPath = path.join(__dirname, 'public', 'CHANGELOG.md');

// Format the date for CST
const options = { timeZone: 'America/Chicago', year: 'numeric', month: 'long', day: 'numeric' };
const todayDate = new Intl.DateTimeFormat('en-US', options).format(new Date());

try {
    // Get the latest git tag
    const latestTag = execSync('git describe --tags --abbrev=0').toString().trim();

    // Fetch all commit messages since that latest tag
    const commitHistory = execSync(`git log ${latestTag}..HEAD --format=%B`).toString();

    // Split into lines and remove extra whitespace
    const lines = commitHistory.split('\n').map(line => line.trim());

    const categories = {
        features: [],
        qol: [],
        fixes: []
    };

    let currentItem = null;

    // Read through the commit message line-by-line
    lines.forEach(line => {
        if (!line) return; // Skip empty blank lines

        const lowerLine = line.toLowerCase();

        // Check if the line is a new category trigger
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
            // If the line DOESN'T have a trigger, attach it as a sub-bullet to the active item!
            currentItem.subItems.push(line);
        }
    });

    if (!categories.features.length && !categories.qol.length && !categories.fixes.length) {
        console.log("⚠️ No changelog lines matching feat:, qol:, or fix: were found since the last tag.");
        process.exit(0);
    }

    // Build the Markdown String
    let markdownUpdate = `# v${newVersion} - ${todayDate}\n\n`;

    const formatItems = (items, sectionTitle) => {
        if (!items.length) return '';
        let sectionStr = `### ${sectionTitle}\n`;

        items.forEach(item => {
            // Check for an inline colon to bold the title (e.g., "Feature Name: Description")
            const splitIndex = item.title.indexOf(':');
            if (splitIndex > 0 && splitIndex < 35) {
                const name = item.title.substring(0, splitIndex).trim();
                const desc = item.title.substring(splitIndex + 1).trim();
                sectionStr += `* **${name}:** ${desc}\n`;
            } else {
                // Otherwise, bold the whole title
                sectionStr += `* **${item.title}**\n`;
            }

            // Add all captured description lines as italicized sub-bullets
            item.subItems.forEach(sub => {
                sectionStr += `  * *${sub}*\n`;
            });
        });
        return sectionStr + `\n`;
    };

    markdownUpdate += formatItems(categories.features, "✨ Gameplay & Features");
    markdownUpdate += formatItems(categories.qol, "🛠️ Quality of Life");
    markdownUpdate += formatItems(categories.fixes, "🐛 Bug Fixes");

    markdownUpdate += `---\n\n`;

    // Prepend to the existing changelog
    const currentChangelog = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '';
    fs.writeFileSync(changelogPath, markdownUpdate + currentChangelog);

    console.log(`✅ Successfully generated and added v${newVersion} to public/CHANGELOG.md!`);

} catch (error) {
    console.error("❌ An error occurred:", error.message);
}