import { pathWithParams } from 'marbles/history';
import Router from 'marbles/router';
import QueryParams from 'marbles/query_params';
import Dispatcher from '../dispatcher';
import GithubAuthComponent from '../views/github-auth';
import GithubComponent from '../views/github';
import GithubDeployComponent from '../views/github-deploy';
import Config from '../config';

var GithubRouter = Router.createClass({
	displayName: "routers.github",

	routes: [
		{ path: "github/auth", handler: "auth", githubAuth: false },
		{ path: "github", handler: "github" },
		{ path: "github/deploy", handler: "deploy", secondary: true },
	],

	willInitialize: function () {
		this.dispatcherIndex = Dispatcher.register(this.handleEvent.bind(this));
	},

	beforeHandler: function (event) {
		// ensure github authorization
		if ( !Config.githubClient ) {
			if (event.handler.opts.githubAuth === false) {
				return;
			}
			event.abort();
			this.__redirectToGithub({replace: true});
		} else {
			var redirect = window.localStorage.getItem("github:path");
			window.localStorage.removeItem("github:path");
			if (redirect) {
				event.abort();
				this.history.navigate(redirect, {replace: true, force: true});
			}
		}
	},

	auth: function () {
		if (Config.githubClient) {
			this.history.navigate("/github", { replace: true, force: true });
			return;
		}

		var props = {
			appName: Config.APP_NAME
		};
		var view = this.context.primaryView;
		if (view && view.constructor.displayName === "Views.GithubAuth" && view.isMounted()) {
			view.setProps(props);
		} else {
			view = this.context.primaryView = React.render(React.createElement(
				GithubAuthComponent, props),
				this.context.el
			);
		}
	},

	github: function (params) {
		var selectedRepo;
		if (params[0].repo && params[0].owner) {
			selectedRepo = {
				ownerLogin: params[0].owner,
				name: params[0].repo
			};
		}
		var props = {
			selectedSource: params[0].org || null,
			selectedType: params[0].type || null,
			selectedRepo: selectedRepo || null,
			selectedRepoPanel: params[0].repo_panel || null,
			selectedBranchName: params[0].branch || null,
			getClusterPath: this.__getClusterPath.bind(this, params),
			getGoBackToClusterText: this.__getGoBackToClusterText.bind(this, params)
		};
		var view = this.context.primaryView;
		if (view && view.constructor.displayName === "Views.Github" && view.isMounted()) {
			view.setProps(props);
		} else {
			view = this.context.primaryView = React.render(React.createElement(
				GithubComponent, props),
				this.context.el);
			}
	},

	deploy: function (params) {
		params = params[0];
		var prevPath = this.history.prevPath;
		if (prevPath === this.history.path) {
			prevPath = null;
		}
		var githubParams = [{
			owner: params.base_owner || params.owner,
			repo: params.base_repo || params.repo
		}];
		if (params.pull) {
			githubParams[0].repo_panel = "pulls";
		}
		var prevPathParts;
		if (prevPath) {
			prevPathParts = prevPath.split("?");
			if (prevPathParts[0] === "github") {
				githubParams = QueryParams.deserializeParams(prevPathParts[1]);
			}
		}
		var githubPath = pathWithParams("/github", githubParams);

		var props = this.__getDeployProps(params);
		if (params.base_owner && params.base_repo) {
			props.baseOwner = params.base_owner;
			props.baseRepo = params.base_repo;
		}
		props.onHide = function () {
			this.history.navigate(prevPath || githubPath);
		}.bind(this);
		props.dismissError = function () {
			view.setProps({ errorMsg: null });
		};
		var view = this.context.secondaryView = React.render(React.createElement(
			GithubDeployComponent, props),
			this.context.secondaryEl
		);

		if ( !prevPath ) {
			this.github(githubParams);
		}
	},

	__getDeployProps: function (params) {
		return {
			ownerLogin: params.owner,
			repoName: params.repo,
			branchName: params.branch,
			pullNumber: params.pull ? Number(params.pull) : null,
			sha: params.sha
		};
	},

	__redirectToGithub: function (opts) {
		window.localStorage.setItem("github:path", this.history.path);
		this.history.navigate("/github/auth", opts || {});
	},

	handleEvent: function (event) {
		switch (event.name) {
			case "GITHUB_BRANCH_SELECTOR:BRANCH_SELECTED":
				this.__handleBranchSelected(event);
			break;

			case "GITHUB_COMMITS:LAUNCH_COMMIT":
				this.__handleLaunchCommit(event);
			break;

			case "GITHUB_PULLS:LAUNCH_PULL":
				this.__handleLaunchPull(event);
			break;

			case "APP:DATABASE_CREATED":
				this.__handleDatabaseCreated(event);
			break;

			case "APP:JOB_CREATED":
				this.__handleJobCreated(event);
			break;

			case "APP:CREATE_FAILED":
				this.__handleAppCreateFailed(event);
			break;

			case "GITHUB_AUTH_CHANGE":
				this.__handleGithubAuthChange(event.authenticated);
			break;

			case "APP:RELEASE_CREATE_FAILED":
				this.__handleReleaseCreateFailed(event);
			break;

			case "APP:RELEASE_CREATED":
				this.__waitForGithubAuth().then(function () {
					this.__handleReleaseCreated(event);
				}.bind(this));
			break;
		}
	},

	__handleBranchSelected: function (event) {
		var path = this.history.getPath();
		var pathParts = path.split("?");
		var handler = this.history.getHandler(pathParts[0]);
		var params = [{}];
		if (handler.name === "github") {
			params = QueryParams.deserializeParams(pathParts[1] || "");
		}
		if (params[0].repo === event.storeId.repoName && params[0].owner === event.storeId.ownerLogin) {
			params = QueryParams.replaceParams(params, {
				branch: event.branchName
			});
			this.history.navigate(pathWithParams("/github", params));
		}
	},

	__handleLaunchCommit: function (event, deployParams) {
		var storeId = event.storeId;
		deployParams = deployParams || {};
		deployParams.owner = storeId.ownerLogin;
		deployParams.repo = storeId.repoName;
		deployParams.sha = event.sha;
		deployParams.branch = storeId.branch;
		this.history.navigate(pathWithParams("/github/deploy", [deployParams]));
	},

	__handleLaunchPull: function (event, deployParams) {
		var head = event.pull.head;
		var base = event.pull.base;
		deployParams = deployParams || {};
		deployParams.owner = head.ownerLogin;
		deployParams.repo = head.name;
		deployParams.base_owner = base.ownerLogin;
		deployParams.base_repo = base.name;
		deployParams.sha = head.sha;
		deployParams.branch = head.ref;
		deployParams.pull = event.pull.number;
		this.history.navigate(pathWithParams("/github/deploy", [deployParams]));
	},

	__handleDatabaseCreated: function (event) {
		var view = this.context.secondaryView;
		if (view && view.constructor.displayName === "Views.GithubDeploy" && view.isMounted() && view.state.name === event.appName) {
			view.setProps({
				env: event.env
			});
		}
	},

	__handleJobCreated: function (event) {
		var view = this.context.secondaryView;
		if (view && view.constructor.displayName === "Views.GithubDeploy" && view.isMounted() && view.state.name === event.appName) {
			view.setProps({
				getAppPath: this.__getAppPath.bind(this, event.appId),
				appId: event.appId,
				job: event.job
			});
		}
	},

	__handleAppCreateFailed: function (event) {
		var view = this.context.secondaryView;
		if (view && view.constructor.displayName === "Views.GithubDeploy" && view.isMounted() && view.state.name === event.appName) {
			view.setProps({
				errorMsg: event.errorMsg
			});
		}
	},

	__handleGithubAuthChange: function (authenticated) {
		if (authenticated && this.__waitForGithubAuthResolve) {
			this.__waitForGithubAuthResolve();
			delete this.__waitForGithubAuthResolve;
			delete this.__waitForGithubAuthPromise;
		}
		if ( !authenticated && this.history.path.match(/^github/) ) {
			this.__redirectToGithub();
		}
	},

	__waitForGithubAuth: function () {
		if (Config.githubClient) {
			return Promise.resolve();
		} else {
			this.__waitForGithubAuthPromise = this.__waitForGithubAuthPromise || new Promise(function (resolve) {
				this.__waitForGithubAuthResolve = resolve;
			}.bind(this));
			return this.__waitForGithubAuthPromise;
		}
	},

	__handleReleaseCreateFailed: function (event) {
		var view = this.context.primaryView;
		if (view && view.constructor.displayName === "Views.GithubAuth" && view.isMounted() && view.props.appName === event.appId) {
			view.setProps({
				errorMsg: event.errorMsg
			});
		}
	},

	__handleReleaseCreated: function (event) {
		var view = this.context.primaryView;
		if (view && view.constructor.displayName === "Views.GithubAuth" && view.isMounted() && view.props.appName === event.appId) {
			// GitHub token saved and loaded, navigate to main GitHub view
			this.history.navigate("/github", { replace: true, force: true });
		}
	},

	__getAppPath: function (appId) {
		return "/apps/"+ encodeURIComponent(appId);
	},

	__getClusterPath: function () {
		return "/";
	},

	__getGoBackToClusterText: function () {
		return "Go back to cluster";
	}
});

export default GithubRouter;
