import * as github from '@actions/github';
import { getInputs } from './action-inputs';
import { ESource, IGithubData, JIRADetails, PullRequestParams } from './types';
import { buildPRDescription, getJIRAIssueKeyByDefaultRegexp, getJIRAIssueKeysByCustomRegexp, getPRDescription } from './utils';

export class GithubConnector {
  githubData: IGithubData = {} as IGithubData;
  client: any;
  context: any;

  constructor() {
    this.context = github.context;
    const { GITHUB_TOKEN } = getInputs();
    this.client = github.getOctokit(GITHUB_TOKEN).rest;
    this.githubData = this.getGithubData();
  }

  get isPRAction(): boolean {
    return this.githubData.eventName === 'pull_request' || this.githubData.eventName === 'pull_request_target';
  }

  get headBranch(): string {
    return this.githubData.pullRequest.head.ref;
  }

  getIssueKeyFromTitle(): string {
    const { WHAT_TO_USE } = getInputs();

    const prTitle = this.githubData.pullRequest.title || '';
    const branchName = this.headBranch;

    let keyFound: string | null = null;

    switch (WHAT_TO_USE) {
      case ESource.branch:
        keyFound = this.getIssueKeyFromString(branchName);
        break;
      case ESource.prTitle:
        keyFound = this.getIssueKeyFromString(prTitle);
        break;
      case ESource.both:
        keyFound = this.getIssueKeyFromString(prTitle) || this.getIssueKeyFromString(branchName);
        break;
    }

    if (!keyFound) {
      throw new Error('JIRA key not found');
    }
    console.log(`JIRA key found -> ${keyFound}`);
    return keyFound;
  }

  private getIssueKeyFromString(stringToParse: string): string | null {
    const { JIRA_PROJECT_KEY, CUSTOM_ISSUE_NUMBER_REGEXP } = getInputs();
    const shouldUseCustomRegexp = !!CUSTOM_ISSUE_NUMBER_REGEXP;

    console.log(`looking in: ${stringToParse}`);

    return shouldUseCustomRegexp
      ? getJIRAIssueKeysByCustomRegexp(stringToParse, CUSTOM_ISSUE_NUMBER_REGEXP, JIRA_PROJECT_KEY)
      : getJIRAIssueKeyByDefaultRegexp(stringToParse);
  }

  async updatePrDetails(details: JIRADetails) {
    const owner = this.githubData.owner;
    const repo = this.githubData.repository.name;
    console.log('Updating PR details');
    const { number: prNumber = 0, body: prBody = '' } = this.githubData.pullRequest;

    const prData = {
      owner,
      repo,
      pull_number: prNumber,
      body: getPRDescription(prBody, buildPRDescription(details)),
    };
    console.log('prdata', prData);

    return await this.client.pulls.update(prData);
  }

  private getGithubData(): IGithubData {
    const {
      eventName,
      payload: {
        repository,
        organization: { login: owner },
        pull_request: pullRequest,
      },
    } = this.context;

    return {
      eventName,
      repository,
      owner,
      pullRequest: pullRequest as PullRequestParams,
    };
  }
}
