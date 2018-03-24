// For a sheet with
// URL = https://docs.google.com/spreadsheets/d/1RSklW9SKI535TG0LnH9cjU2c3spLtnbPBAKWahUWO7I/edit#gid=0
// Change these variables variable
var spreadsheet_id = ""
var ticketmaster_api_token = ""
var debug = false
var auto_update_check = false;
var branch_to_check_for_updates = "master";
var github_api_token = ""



var TESTING = false;
var events_to_email = new Array();

// Email Related classes and functions//{{{

// Email class.
function Email(subject, body) {
  this.body = body;
  this.subject = subject;
  this.recipient = Session.getActiveUser().getEmail();
  this.Send = function() {
    // If we are testing, don't send an email. Just log a message
    if (!TESTING) {
      MailApp.sendEmail(this.recipient, this.subject, this.body);
    }
    else {
      var log = "Testing Mode: Email = recipient: " + this.recipient;
      log = log + ", subject: " + this.subject + ", body: ";
      log = log + this.body;
      Logger.log(log);
    }
  };
}

function email_log() {
  var e = new Email();
  e.body = Logger.getLog();
  e.subject = "Ticketmaster Alert: Execution Log"
  e.Send();
}

function email_error(err) {
  var e = new Email();
  e.body = "Error at: " + err.lineNumber + ": " + err.message;
  e.subject = "Ticketmaster Alert: Error"
  e.Send();
}

function email_alert_for_added_events() {
  arr = events_to_email
  var size = arr.length;
  if (size >= 1) {
    var body = "";
    for (k = 0; k < size; k++) {
      body = body + "\n" + arr[k];
    }
    var subject = "Automated Message: Ticketmaster Alert: Added Events"
    var e = new Email(subject, body);
    e.Send();
  }

}

function email_alert_for_script_update(newhash, oldhash) {
  var body = "An update has been made to the script.";
  body = body + "\n\n";
  body = body + "Check \"https://github.com/hallzy/ticketmaster-google-script\"";
  body = body + "\n\n";
  body = body + "The last time an update check was made the current commit ";
  body = body + "hash was \"" + oldhash + "\"";
  body = body + "\n\n";
  body = body + "Now the current hash is \"" + newhash + "\"";
  var subject = "Automated Message: Ticketmaster Script Ready for Update"
  var e = new Email(subject, body);
  e.Send();
}
//}}}

// Retrieves the number of occurrences of an event that exist in the given
// location based on the API
function get_number_of_events(api) {
  var num = api['_embedded']['events'].length;
  Logger.log("Number of events: " + num);
  return num;
}

function getEventURL(event) {
  var url = "https://app.ticketmaster.com/discovery/v2/events.json?" +
            "countryCode=" + event.country +
            "&stateCode="  + event.state   +
            "&keyword="    + event.keyword +
            "&apikey="     + ticketmaster_api_token;

  Logger.log("URL: " + url);
  return url;
}

function getResponse(event) {
  // get the API URL for the current event and location
  var url = getEventURL(event);
  // remove white space from the end of the URL
  url = url.replace(/^\s+|\s+$/g, '');

  // If we fail to get a response, send off some logs and exit
  var exit_now = false;
  try {
    var response = UrlFetchApp.fetch(url);
    return response;
  }
  catch(e) {
    exit_now = true;
    var err = e;
  }

  if (exit_now == true) {
    email_alert_for_added_events();
    if (debug == true) {
      email_log();
    }

    email_error(err);
    throw err;
  }
  return response;
}

function check_for_updates(sheet) {
  // Get the URL to check. This will be the Github page with the list of commits
  // for the specified branch
  var url = "https://api.github.com/repos/hallzy/ticketmaster-google-script/commits/"
  url = url + branch_to_check_for_updates;

  // If an API token has been specified then use it, otherwise, don't.
  if (github_api_token !== "") {
    url = url + "?access_token="
    url = url + github_api_token
  }
  Logger.log("API URL = " + url)

  // Get the page as a string
  try {
    var newhash = UrlFetchApp.fetch(url).getContentText()
  }
  catch(e) {
    Logger.log("Github API Error. No commit found.")
    email_error(e)
    throw e
  }

  try {
    newhash = JSON.parse(newhash)
  }
  catch(e) {
    Logger.log("Failed to Parse \"newhash\"")
    email_error(e)
    throw e
  }

  try {
    newhash = newhash["sha"]
  }
  catch(e) {
    Logger.log("No hash in JSON")
    email_error(e)
    throw e
  }
  Logger.log(newhash)

  var oldhash;
  // Get the previously saved hash from the sheet
  if (sheet.isVersionHashBlank()) {
    Logger.log("hash is initialized to: " + newhash);
    sheet.setVersionHash(newhash)
  }
  else {
    oldhash = sheet.getVersionHash()
    if (newhash != oldhash) {
      Logger.log("hash is now: " + newhash);
      email_alert_for_script_update(newhash, oldhash);
      sheet.setVersionHash(newhash)
    }
  }
  Logger.log("Old hash is: " + oldhash);
}

// Google Sheet Class//{{{
function GoogleSheet() {
  this.base       = SpreadsheetApp.openById(spreadsheet_id).getSheets()[0];
  this.getData    = this.base.getDataRange().getValues();
  this.getLastRow = this.base.getDataRange().getLastRow();

  this.getKeyword = function(index) {
    return this.getData[index+1][0];
  };

  this.getCountryCode = function(index) {
    return this.getData[index+1][3];
  };

  this.getStateCode = function(index) {
    return this.getData[index+1][2];
  };

  this.getNumberOfEvents = function(index) {
    return this.getData[index+1][1];
  };

  this.setNumberOfEvents = function(index, number) {
    this.base.getRange(index+2, 2).setValue(number);
  };

  this.isCountryBlank = function(index) {
    return this.base.getRange(index+2, 4).isBlank();
  };

  this.isStateBlank = function(index) {
    return this.base.getRange(index+2, 3).isBlank();
  };

  this.getVersionHash = function() {
    return this.getData[0][6]
  };

  this.isVersionHashBlank = function() {
    return this.base.getRange(1, 7).isBlank();
  };

  this.setVersionHash = function(hash) {
    this.base.getRange(1, 7).setValue(hash);
  };

  this.Update = function() {
    this.base       = SpreadsheetApp.openById(spreadsheet_id).getSheets()[0];
    this.getData    = this.base.getDataRange().getValues();
    this.getLastRow = this.base.getDataRange().getLastRow();
  };
}
//}}}

function Event(index, sheet) {
  this.keyword = sheet.getKeyword(index);
  this.index = index;
  this.country = sheet.getCountryCode(k)
  this.state = sheet.getStateCode(k)
}

function run() {
  // Get the google sheet with event data
  var sheet = new GoogleSheet();

  if (auto_update_check == true) {
    check_for_updates(sheet);
  }

  // Iterate through every event
  for (k = 0; k < sheet.getLastRow - 1; k++) {
    var current_event_idx = k;

    if (sheet.isCountryBlank(k) || sheet.isStateBlank(k)) {
      break;
    }
    // Repopulate the sheet after adding emailed events to the sheet. Also,
    // execute this when we come back through the loop for rechecking events.
    sheet.Update();

    var event = new Event(k, sheet);
    Logger.log("==============================");
    Logger.log("Event Name: " + event.keyword);
    Logger.log("Event Locations: " + event.state + ", " + event.country)
    Logger.log("Event Index: " + k);
    var sheet_num_events = undefined;
    var sheet_num_events = sheet.getNumberOfEvents(event.index);

    var response = getResponse(event);

    // Get the event data from the API
    var json_string = response.getContentText();
    var api = JSON.parse(json_string);
    if(!('_embedded' in api)) {
      Logger.log("Event Doesn't exist in this location")
      sheet.setNumberOfEvents(k, 0);
      continue;
    }
    var api_events = api['_embedded']['events'];
    var api_num_events = get_number_of_events(api);

    if (api_num_events < sheet_num_events) {
      // If we know of more events than what exist, the older events have
      // probably now happened, so set the sheet number to the API number and
      // continue
      sheet.setNumberOfEvents(api_num_events);

      continue;
    }

    // If there are more events now than what there was before, add that event
    // to the email
    Logger.log("Number of events shown in the sheet: " + sheet_num_events)
    if (api_num_events > sheet_num_events || sheet_num_events == undefined) {
      sheet.setNumberOfEvents(k, api_num_events);
      events_to_email.push(event.keyword +
                           " has a new show in " +
                           event.state + ", " +
                           event.country);
      for (var api_event in api_events) {
        var name = "";
        var location = "";
        var date = "";
        var url = "";
        if ('name' in api_events[api_event]) {
          var name = api_events[api_event]['name'];
        }
        if('_embedded' in api_events[api_event]) {
          var this_event = api_events[api_event]
          if ('venues' in this_event['_embedded']) {
            var this_event = this_event['embedded']
            if ('city' in this_event['venues'][0] &&
                'state' in this_event['venues'][0]) {
              var this_event = this_event['venues'][0]
              if ('name' in this_event['city'] &&
                  'name' in this_event['state']) {
                var this_event_city = this_event['city']
                var this_event_state = this_event['state']
                var location = this_event_city['name'] + ", " +
                               this_event_state['name']
              }
            }
          }
        }
        if('dates' in api_events[api_event]) {
          if ('start' in api_events[api_event]['dates']) {
            if ('localDate' in api_events[api_event]['dates']['start']) {
              var date = api_events[api_event]['dates']['start']['localDate']
            }
          }
        }
        if ('url' in api_events[api_event]) {
          var url = api_events[api_event]['url']
        }

        var email_body = "    - "
        if (name != "") {
          email_body += "\"" + name + "\": "
        }
        if (location != "") {
          email_body += location + " "
        }
        if (date != "") {
          email_body += "On " + date + " "
        }
        if (url != "") {
          email_body += " - " + url
        }
        events_to_email.push(email_body);
      }
    }
  }
  email_alert_for_added_events();

  if (debug == true) {
    email_log();
  }

}
