export const FEATURE_FLAGS = Object.freeze({
  projects: true, memories: true, integrations: true, agentTasks: true, approvals: true,
  fileUploads: true, realtime: false, imageGeneration: false, webResearch: false,
  githubActions: false, cloudflareDeployments: false, voiceOutput: false
});
export const PROVIDER_REQUIRED_FLAGS = Object.freeze({
  imageGeneration: ['IMAGE_PROVIDER_API_KEY'],
  webResearch: ['SEARCH_API_KEY'],
  githubActions: ['GITHUB_TOKEN'],
  cloudflareDeployments: ['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID'],
  voiceOutput: ['TTS_API_KEY']
});
