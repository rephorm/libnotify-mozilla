/*
 *  Overlay Javascript for thunderbird
 *
 *  Copyright (c) 2009 Patrik Dufresne & Ruben Verweij
 */

/*
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation; either version 3 of the License, or (at your option)
 * any later version.
 */


/**
 * References to all components
 */
const nsISupports = Components.interfaces.nsISupports;
const nsIStringBundleService = Components.interfaces.nsIStringBundleService;
const nsIMsgFolderListener = Components.interfaces.nsIMsgFolderListener;
const nsIMsgFolderNotificationService = Components.interfaces.nsIMsgFolderNotificationService;
const nsIPrefService = Components.interfaces.nsIPrefService;
const nsIMsgAccountManager = Components.interfaces.nsIMsgAccountManager;
const nsIMsgAccount = Components.interfaces.nsIMsgAccount;
const nsILocalFile = Components.interfaces.nsILocalFile;
const nsIProcess = Components.interfaces.nsIProcess;
const nsIPromptService = Components.interfaces.nsIPromptService;
const nsIMsgDBHdr = Components.interfaces.nsIMsgDBHdr;


/**
 * We don't really need this variables, maybe in future versions, so I keep them in comments:
 * UUID uniquely identifying our component
 * You can get from: http://kruithof.xs4all.nl/uuid/uuidgen here
const CLASS_ID = Components.ID("{4157dfb0-173f-11de-8c30-0800200c9a66}");
 */
/**
 * Description
const CLASS_NAME = "Messenger Notification Javascript XPCOM Component";
 */
/**
 * Textual unique identifier
const CONTRACT_ID = "@libnofity.info/messenger-notifications;1";
const THUNDERBIRD_ID = "{3550f703-e582-4d05-9a08-453d09bdfdc6}";
 */

const ADDON_ID = "libnotifypopups@patrik.dufresne";
const BUNDLE_LOCATION = "chrome://libnotifypopups/locale/libnotifypopups.properties";

const MSG_FLAG_NEW = 0x10000;
const FLR_FLAG_INBOX = 0x1000;
const FLR_FLAG_TRASH = 0x0100;
const FLR_FLAG_DRAFTS = 0x0400;
const FLR_FLAG_TEMPLATES = 0x400000;
const FLR_FLAG_JUNK = 0x40000000;
const FLR_FLAG_NEWSGROUP = 0x0001;
const FLR_FLAG_NEWS_HOST = 0x0001;
const FLR_FLAG_QUEUE =  0x0800;
const FLR_FLAG_SENTMAIL = 0x0200;
const FLR_FLAG_IMAP_NOSELECT = 0x1000000;
const FLR_FLAG_CHECK_NEW = 0x20000000;
const SRV_RSS = "rss";

function log(msg) {
  console = Components.classes['@mozilla.org/consoleservice;1']
    .getService(Components.interfaces.nsIConsoleService);
  console.logStringMessage(msg);
}

/**
 * Class constructor
 */
function MessengerNotifications() {
  this.init();
};

/**
 * Class definition
 */
MessengerNotifications.prototype = {

  init: function() {
    dump("MessengerNotifications::init\r\n");

    // If you only need to access your component from Javascript, uncomment the
    // following line:
    this.wrappedJSObject = this;

    // Retrieve String Bundle
    var sbs = Components.classes["@mozilla.org/intl/stringbundle;1"]
      .getService(nsIStringBundleService);
    this.mBundle = sbs.createBundle(BUNDLE_LOCATION);

    // Initialise array for notification queue
    this.mailQueue = new Array(0);
    // Initialise array for indicators
    this.indicators = new Array(0);
    // True if a notification is display.
    this.displayingMessage = false;

    // Registering listeners
    var notificationService = Components.classes["@mozilla.org/messenger/msgnotificationservice;1"]
      .getService(nsIMsgFolderNotificationService);
    notificationService.addListener(this, notificationService.msgAdded, notificationService.itemAdded); // TB 3 = itemAdded, TB 2 = msgAdded

    // Check if libnotifypopups.showFolder, libnotifypopups.showNews and libnotifypopups.showIndicator exists. If not, set default values.
    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(nsIPrefService);
    if(!prefs.prefHasUserValue("libnotifypopups.showFolder")) {
      prefs.setBoolPref("libnotifypopups.showFolder", false);
    }
    if(!prefs.prefHasUserValue("libnotifypopups.showIndicator")) {
      prefs.setBoolPref("libnotifypopups.showIndicator", true);
    }
    if(!prefs.prefHasUserValue("libnotifypopups.showNews")) {
      prefs.setBoolPref("libnotifypopups.showNews", false);
    }

    this.initIndicators();
  },

  initIndicators: function initIndicators() {
    var em = Components.classes["@mozilla.org/extensions/manager;1"]
             .getService(Components.interfaces.nsIExtensionManager);

    var pythonpath = em.getInstallLocation(ADDON_ID).getItemFile(ADDON_ID, "indicator.py").path; 
    log("pythonpath: " + pythonpath);
    var fifopath = em.getInstallLocation(ADDON_ID).getItemFile(ADDON_ID, "indicator-fifo").path; 
    //var pythonpath = "/home/rephorm/bin/messaging.py";
    //var fifopath = "/tmp/thunderbird-indicator-fifo";

    // run python server
    var file = Components.classes["@mozilla.org/file/local;1"].
      createInstance(nsILocalFile);
    file.initWithPath(pythonpath);

    var process = Components.classes["@mozilla.org/process/util;1"]
      .createInstance(nsIProcess);
    process.init(file);
    this.process = process

    // run once blocking to create fifo
    args = new Array(fifopath, 'mkfifoonly')
    process.run(true, args, args.length);

    // run again to start server
    args = new Array(fifopath)
    process.run(false, args, args.length);


    // connect to fifo so we can send messages
    file = Components.classes["@mozilla.org/file/local;1"]
      .createInstance(Components.interfaces.nsILocalFile);
    file.initWithPath(fifopath);

    var stream = Components.classes["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Components.interfaces.nsIFileOutputStream);
    stream.init(file, 0x02, -1, 0) // 0x02 == writeonly
      this.indicatorStream = stream;

  },

  sendIndicator: function sendIndicator(folder) {
    var num = folder.getNumUnread(false);
    var label = this.indicatorLabel(folder)
    var cmd = "show::" + label + "::" + num + "\n";

    this.indicators[this.indicators.length] = label;
    this.indicatorStream.write(cmd, cmd.length);
  },

  hideIndicators: function hideIndicators(folders) {
    log("hideIndicators (" + folders.length + ")");
    for (var i in folders) {
      this.hideIndicator(folders[i]);
    }
  },

  hideIndicator: function hideIndicator(folder) {
    var label = this.indicatorLabel(folder);
    log("hide indicator: " + label);
    var i = this.indicators.indexOf(label);
    log("index: " + i);
    if (i != -1)
    {
      var cmd = "hide::" + label;
      log("cmd: " + cmd);
      this.indicators.splice(i, 1);
      this.indicatorStream.write(cmd, cmd.length);
    }
  },

  indicatorLabel: function (folder) {
    return folder.prettiestName + " - " + folder.rootFolder.prettiestName;
  },

  /**
   * Receive an event when a new mail is added to a folder.
   */
  msgAdded: function msgAdded(aMsg) {
    var header = aMsg.QueryInterface(nsIMsgDBHdr);
    var junkScore = header.getStringProperty("junkscore");
    var isJunk = ((junkScore != "") && (junkScore != "0"));
    if(!isJunk){
      var folder = header.folder;

      if (!this.checkFolder(folder)) {
        return;
      }

      if (header.flags & MSG_FLAG_NEW) {
        this.sendIndicator(folder);

        // queue notification
        var folderRoot = folder.rootFolder;
        var folderName = folderRoot.prettiestName;
        var subject = header.mime2DecodedSubject
        var author = header.mime2DecodedAuthor;
        this.handleNewMailReceive(folderName, subject, author);
      }
    }
  },

  /**
   * Used by Thunderbird 2
   */
  itemAdded: function itemAdded(aItem) {
    this.msgAdded(aItem);
  },

  /**
   * This determines if this folder should even be checked to send a
   * notification to libnotify.
   */
  checkFolder: function checkFolder(aFolder)
  {
    // TODO at least until I come up with some kind of message queue that slowly
    // displays messages, we ignore RSS feeds.

    // If it's the Inbox, let it through without checking other flags (an inbox
    // may also be marked as the sent mail box).
    if ((aFolder.flags & FLR_FLAG_INBOX) == FLR_FLAG_INBOX){
      return true;
    }

    // Also return true if the folder is checked for new messages, otherwise return false
    if ((aFolder.flags & FLR_FLAG_CHECK_NEW) == FLR_FLAG_CHECK_NEW){
      return true;
    }else{
      return false;
    }

    // XXX This code is never reached...
    // We don't check certain folders because they don't contain useful stuff
    if ((aFolder.flags & FLR_FLAG_TRASH) == FLR_FLAG_TRASH ||
      (aFolder.flags & FLR_FLAG_JUNK) == FLR_FLAG_JUNK ||
      (aFolder.flags & FLR_FLAG_SENTMAIL) == FLR_FLAG_SENTMAIL ||
      (aFolder.flags & FLR_FLAG_DRAFTS) == FLR_FLAG_DRAFTS ||
      (aFolder.flags & FLR_FLAG_TEMPLATES) == FLR_FLAG_TEMPLATES ||
      (aFolder.flags & FLR_FLAG_QUEUE) == FLR_FLAG_QUEUE ||
      aFolder.server.type == SRV_RSS){
      return false;
    }

    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
      .getService(nsIPrefService);

    var showNews = prefs.getBoolPref("libnotifypopups.showNews");
    if(showNews){
      if ((aFolder.flags & FLR_FLAG_NEWSGROUP) == FLR_FLAG_NEWSGROUP ||
        (aFolder.flags & FLR_FLAG_NEWS_HOST) == FLR_FLAG_NEWS_HOST){
        return true;
      }
    }

    return true;
  },

  QueryInterface: function QueryInterface(aIID) {
    if (aIID.equals(nsISupports) || aIID.equals(nsIMsgFolderListener)) {
      return this;
    }
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  /**
   * Put the new mail in a queue ready for notification message.
   */
  handleNewMailReceive : function handleNewMailReceive(folderName, subject, author)
  {
    log("handleNewMailReceive"); 
    if(!this.displayingMessage) {
      log("not displaying message");
      var item = {'folderName': folderName, 'subject': subject,
        'author': author};
      item.folderName;
      item.subject;
      this.mailQueue[this.mailQueue.length] = item;
      // Wait a bit so that we have more message to display
      setTimeout("libnotifypopups.displayNotification()", 5000);
    }
  },

  /**
   * Build the notification message from mails in queue and display
   * it with notify OSD.
   */
  displayNotification : function displayNotification() {
    this.displayingMessage = true;
    log("display")
      try{
        var prefs = Components.classes["@mozilla.org/preferences-service;1"]
          .getService(nsIPrefService);

        var showFolder = prefs.getBoolPref("libnotifypopups.showFolder");
        if(this.mailQueue.length == 1){

          var subject = this.mailQueue[0].subject;
          var author = this.mailQueue[0].author;
          var folder = this.mailQueue[0].folderName;

          var summary = this.mBundle.GetStringFromName("mail.new.mail.summary");
          if(showFolder){
            var body = this.mBundle.formatStringFromName("mail.new.mails.bodyWithFolder",
              [subject, author, folder], 3);
          }else{
            var body = this.mBundle.formatStringFromName("mail.new.mails.body",
              [subject, author], 2);
          }
          this.sendNotification(summary, body, "notification-message-email", "email.arrived");

        } else {
          if(this.mailQueue.length != 0){
            if(this.mailQueue.length == 2){

              var body = "";
              for(var index=0;index<2;index++) { // Due to the if statement we always have 2 elements
                var subject = this.mailQueue[index].subject;
                var author = this.mailQueue[index].author;
                var folder = this.mailQueue[index].folderName;
                if(showFolder){
                  body += this.mBundle.formatStringFromName("mail.new.mails.bodyWithFolder",
                    [subject, author, folder], 3) + "\r\n";
                }else{
                  body += this.mBundle.formatStringFromName("mail.new.mails.body",
                    [subject, author], 2) + "\r\n";
                }
              }
            }
            if(this.mailQueue.length>=3){
              var body = "";
              for(var index=0;index<2;index++) { // Only display the first two new mails, then display ...
                var subject = this.mailQueue[index].subject;
                var author = this.mailQueue[index].author;
                var folder = this.mailQueue[index].folderName;
                if(showFolder){
                  body += this.mBundle.formatStringFromName("mail.new.mails.bodyWithFolder",
                    [subject, author, folder], 3) + "\r\n";
                }else{
                  body += this.mBundle.formatStringFromName("mail.new.mails.body",
                    [subject, author], 2) + "\r\n";
                }
              }
              body += "...";
            }

            var summary = this.mBundle.formatStringFromName("mail.new.mails.summary",
              [this.mailQueue.length], 1);
            this.sendNotification(summary, body, "notification-message-email", "email.arrived");
          }
        }
        this.mailQueue = new Array(0);
        this.displayingMessage = false;
      } catch(e){
        log("error: " + e.message);
        this.mailQueue = new Array(0);
        this.displayingMessage = false;
        Components.utils.reportError(e);
        throw e;
      }
  },


  /**
   * Send notification using 'notify-send' command line.
   */
  sendNotification : function sendNotification(summary, body, iconName, category) {
    // Send a notification via libnotify
    log("sendNotification");
    try {
      dump("MessengerNotifications::sendNotification\r\n");
      var file = Components.classes["@mozilla.org/file/local;1"].
        createInstance(nsILocalFile);
      file.initWithPath("/usr/bin/notify-send");

      var process = Components.classes["@mozilla.org/process/util;1"]
        .createInstance(nsIProcess);
      process.init(file);
      var args = [utf8.encode(summary), utf8.encode(body), "-i", iconName, "-c", category];
      process.run(false, args, args.length);
    } catch(e) {
      var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
        .getService(nsIPromptService);
      prompts.alert(null, "Dependency error", "To see notifications via libnotify, the libnotify-bin package needs to be installed. Please install this package via System->Administration->Synaptic Package Manager.");
      Components.utils.reportError(e);
      throw e;
    }
  }
}

/**
 * Initialise the notification system.
 */
var libnotifypopups = null;

function libnotifypopups_onLoad() {
  log("onLoad libnotifypopups");
  libnotifypopups = new MessengerNotifications();
  window.document.getElementById('folderTree').addEventListener("select", function(ev) {
    log("folder(s) selected...")
    //var folders = this.getSelectedFolders();

    var folders = gFolderTreeView.getSelectedFolders();
    log("got folders");
    log("folders:" + folders);
    libnotifypopups.hideIndicators(folders);
  }, false);
  removeEventListener("load", libnotifypopups_onLoad, true);
}

function libnotifypopups_unLoad() {
  var prefs = Components.classes["@mozilla.org/preferences-service;1"]
    .getService(nsIPrefService);
  var enableIndicator = prefs.getBoolPref("libnotifypopups.showIndicator");

  log("unload: " + libnotifypopups.process);
  if (libnotifypopups.process)
    libnotifypopups.process.kill();

  if (libnotifypopups.indicatorStream)
    libnotifypopups.indicatorStream.close();

  libnotifypopups = null;
  removeEventListener("unload", libnotifypopups_unLoad, true);
}

addEventListener("load", libnotifypopups_onLoad, false);
addEventListener("unload", libnotifypopups_unLoad, false);

