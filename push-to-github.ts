import { getUncachableGitHubClient } from './server/github';

async function createRepoAndPush() {
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`Authenticated as: ${user.login}`);
    
    // Create repository
    const repoName = 'HiveMind_AI';
    try {
      const { data: repo } = await octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'Train Your AI - A gamified quiz game with Solana wallet integration',
        private: false,
        auto_init: false
      });
      console.log(`Repository created: ${repo.html_url}`);
      console.log(`REPO_URL=${repo.clone_url}`);
      console.log(`REPO_OWNER=${user.login}`);
    } catch (e: any) {
      if (e.status === 422) {
        console.log(`Repository ${repoName} already exists`);
        console.log(`REPO_URL=https://github.com/${user.login}/${repoName}.git`);
        console.log(`REPO_OWNER=${user.login}`);
      } else {
        throw e;
      }
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createRepoAndPush();
