const [tag, version, releaseUrl] = process.argv.slice(2);
const { RELEASE_WEBHOOK, GITHUB_REPOSITORY } = process.env;

if (!RELEASE_WEBHOOK) {
  process.exit(0);
}

if (!tag || !version) {
  console.error('Missing release params; skipping webhook notification.');
  process.exit(0);
}

const body = {
  text: `Release ${tag} published for ${GITHUB_REPOSITORY}: ${version}. ${releaseUrl}`,
  releaseTag: tag,
  releaseVersion: version,
  releaseUrl: releaseUrl
};

(async () => {
  try {
    await fetch(RELEASE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.warn('Failed to send release webhook:', error?.message || error);
  }
})();
