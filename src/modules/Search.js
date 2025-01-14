const inquirer = require('inquirer');
const FilterResult = require('./FilterResult');
const Download = require('./Download');
const _ = require('lodash');
const chalk = require('chalk');
const log = console.log;

module.exports = function (searchService, downloadService, options, client) {
  this.download = new Download(downloadService, searchService, options, client);
  this.filterResult = new FilterResult(options.quality, options.mode);
  this.searchService = searchService;
  this.downloadService = downloadService;
  this.client = client;
  this.timeout = options.timeout ?? 2000;
  this.showPrompt = options.showPrompt ?? true;

  /**
   * Launch search query, then call a callback
   */
  this.search = () => {
    const query = this.searchService.getNextQuery();
    log(chalk.green("Searching for '%s'"), query);
    const searchParam = {
      req: query,
      timeout: this.timeout,
    };
    const afterSearch = (err, res) => this.onSearchFinished(err, res);
    this.client.search(searchParam, afterSearch);
  };

  /**
   * Callback called when the search query get back
   */
  this.onSearchFinished = (err, res) => {
    if (err) {
      return log(chalk.red(err));
    }

    const filesByUser = this.filterResult.filter(res);
    this.checkEmptyResult(filesByUser);

    if (this.showPrompt) {
      this.showResults(filesByUser);
    } else {
      this.showTopResult(filesByUser);
      process.exit(0);
    }
  };

  /**
   * If the result set is empty and there is no pending searches quit the process.
   * If there is pending searches, launch the next search.
   * If the result set is not empty just log success message.
   */
  this.checkEmptyResult = (filesByUser) => {
    if (_.isEmpty(filesByUser)) {
      log(chalk.red('Nothing found'));
      this.searchService.consumeQuery();

      if (this.searchService.allSearchesCompleted()) {
        process.exit(1);
      }

      this.search();
    } else {
      log(chalk.green('Search finished'));
    }
  };

  /**
   * Display the top result
   *
   * @param {array} filesByUser
   */
  this.showTopResult = (filesByUser) => {
    const numResults = Object.keys(filesByUser).length;

    if (numResults > 0) {
      const topResult = String(_.keys(filesByUser)[0]);
      log(chalk.green('Search returned ' + numResults + ' results'));
      log(chalk.blue('Top result: %s'), topResult);
    }
  };

  /**
   * Display a list of choices that the user can choose from.
   *
   * @param {array} filesByUser
   */
  this.showResults = (filesByUser) => {
    const numResults = Object.keys(filesByUser).length;

    log(chalk.green('Displaying ' + numResults + ' search results'));

    const options = {
      type: 'rawlist',
      name: 'user',
      pageSize: 10,
      message: 'Choose a folder to download',
      choices: _.keys(filesByUser),
    };
    inquirer.prompt([options]).then((answers) => this.processChosenAnswers(answers, filesByUser));
  };

  /**
   * From the user answer, trigger the download of the folder
   * If there is pending search, launch the next search query
   *
   * @param {array} answers
   * @param filesByUser
   */
  this.processChosenAnswers = (answers, filesByUser) => {
    this.searchService.consumeQuery();
    this.download.startDownloads(filesByUser[answers.user]);

    if (this.searchService.allSearchesCompleted()) {
      this.downloadService.downloadLogger.flush();
      this.downloadService.everyDownloadCompleted();
    } else {
      this.search();
    }
  };
};
