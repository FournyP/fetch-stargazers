const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const fetch = require("node-fetch");
const prompt = require("prompt");

let schema = {
  properties: {
    token: {
      hidden: true,
      required: true,
    },
    repositories: {
      pattern: /^[a-zA-Z/\s-]+$/,
      message: "Repositories must be only letters, slash, spaces, or dashes",
      required: true,
    },
  },
};

// Ask for script configuration
prompt.start();

prompt.get(schema, async function (err, result) {
  const { repositories, token } = result;

  const realRepositories = repositories.trimStart().split(" ");

  let stargazers = [];

  for (let repository of realRepositories) {
    console.log(`Fetching stargazers for ${repository}...`);
    stargazers.push(...(await fetchStargazers({ repository, token })));
    console.log(`Successfuly fetched stargazer data in ${repository}.csv`);
  }

  const csvWriter = createCsvWriter({
    path: "result.csv",
    header: [
      { id: "url", title: "url" },
      { id: "login", title: "login" },
      { id: "email", title: "email" },
      { id: "websiteUrl", title: "websiteUrl" },
      { id: "twitterUsername", title: "twitterUsername" },
    ],
  });

  // Filter out duplicates
  stargazers = stargazers.filter(
    (stargazer, index, self) =>
      index === self.findIndex((t) => t.login === stargazer.login)
  );

  await csvWriter.writeRecords(stargazers);

  console.log("Done!");
});

async function fetchStargazers({ repository, token }) {
  let stargazers = [];
  let endCursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const [username, repo] = repository.split("/");

    const usersInfo = await getUsersInfo({
      username,
      repo,
      token,
      endCursor,
    });

    hasNextPage = usersInfo.hasNextPage;
    endCursor = usersInfo.endCursor;

    stargazers.push(...usersInfo.stargazers);
  }

  return stargazers;
}

async function getUsersInfo({ username, repo, token, endCursor }) {
  const endCursorForQuery = endCursor ? `"${endCursor}"` : null;

  const query = `
  query { 
    repository(owner:"${username}" name:"${repo}") {
      id
      stargazers(first: 100, after: ${endCursorForQuery}, orderBy: {field: STARRED_AT, direction:ASC}){
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            url
            login
            email
            websiteUrl
            twitterUsername
          }
        }
      }
    }
  }
  `;

  const usersResponse = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
    },
    body: JSON.stringify({ query }),
  });

  const response = await usersResponse.text();
  const parsedResponse = JSON.parse(response);
  const stargazers = parsedResponse.data.repository.stargazers;

  return {
    hasNextPage: stargazers.pageInfo.hasNextPage,
    endCursor: stargazers.pageInfo.endCursor,
    stargazers: stargazers.edges.map(({ node: user }) => ({
      url: user.url,
      login: user.login,
      email: user.email,
      websiteUrl: user.websiteUrl,
      twitterUsername: user.twitterUsername,
    })),
  };
}
