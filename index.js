const fs = require('fs')
const core = require('@actions/core')
const { createActionAuth } = require('@octokit/auth-action');
const { Octokit } = require('@octokit/rest');
const octokit = new Octokit({
  authStrategy: createActionAuth,
})

async function run() {
  try {
    const enterprise = core.getInput('enterprise')
    const outputFilename = core.getInput('outputFilename')

    core.info(`Retrieving repositories for ${enterprise}!`)
    const query = `query($enterpriseName:String!, $cursor:String) {
      enterprise(slug: $enterpriseName) {
        name
        organizations(first: 10, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          totalCount
          nodes {
            name 
            login
          }
        }
      }
    }`;
    const variables = {
      enterpriseName: enterprise
    }
    
    let hasNextPage = true
    let orgs = []

    while (hasNextPage) {
      const result = await octokit.graphql(query, variables)
      orgs = orgs.concat(result.enterprise.organizations.nodes)
      hasNextPage = result.enterprise.organizations.pageInfo.hasNextPage
      variables.cursor = result.enterprise.organizations.pageInfo.endCursor
    }

    for (let org of orgs) {
      await octokit.paginate(octokit.repos.listForOrg, {
        org: org.login, 
        type: 'internal'
      }).then(repos => {
        org.repositories = []
        for(let repo of repos) {
          org.repositories.push(repo)
        }
      }).catch(error => {
        core.error(`${org.login} - ${error}`)
      })
    }

    core.setOutput('repo-list', orgs)
    if(outputFilename) {
      core.info(`Saving repositories to ${outputFilename}`)
      fs.writeFileSync(outputFilename, JSON.stringify(orgs))
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run()