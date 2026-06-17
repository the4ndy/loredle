const { execSync } = require('child_process');
const fs = require('fs');

try {
    // Read the version that the generator script just updated
    const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
    const version = pkg.version;

    console.log(`Locking in release v${version}...`);

    // Stage the files
    execSync('git add public/changelog.md package.json');

    // Commit the files
    execSync(`git commit -m "chore: release v${version}"`);

    // Create the Git Tag
    execSync(`git tag v${version}`);

    console.log(`✅ Committed and tagged v${version}!`);
    console.log(`🚀 You can now run: git push --follow-tags`);

} catch (err) {
    console.error("❌ Error finishing release. Check if your files are already committed.");
}