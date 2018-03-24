// For a sheet with
// URL = https://docs.google.com/spreadsheets/d/1RSklW9SKI535TG0LnH9cjU2c3spLtnbPBAKWahUWO7I/edit#gid=0
// Change these variables variable
var spreadsheet_id = ""
var api_key = ""
//var get_status_change_alert = true
var debug = true



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

// Retrive sthe number of episodes for a tv show from the API
function get_number_of_events(api) {
  var num = api['_embedded']['events'].length;
  Logger.log("Number of events: " + num);
  return num;
}

function getEventURL(event) {
  var url = "https://app.ticketmaster.com/discovery/v2/events.json?countryCode=" + event.country +
            "&stateCode=" + event.state +
            "&keyword=" + event.keyword +
            "&apikey=" + api_key;

  Logger.log("URL: " + url);
  return url;
}

function getResponse(event) {
  // get the api url for the current show
  var url = getEventURL(event);
  // remove whitespace from the end of the url
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
  this.country = undefined
  this.state = undefined
}

function run() {
  // Get the google sheet with tv show data
  var sheet = new GoogleSheet();

  // Iterate through every event
  for (k = 0; k < sheet.getLastRow - 1; k++) {
    var currentshow_index = k;

    if (sheet.isCountryBlank(k) || sheet.isStateBlank(k)) {
      break;
    }
    // Repopulate the sheet after adding emailed shows to the sheet. Also,
    // execute this when we come back through the loop for rechecking shows.
    sheet.Update();

    var event = new Event(k, sheet);
    event.country = sheet.getCountryCode(k)
    event.state = sheet.getStateCode(k)
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
      // If we know of more events than what exist, the older shows have probably now
      //happened, so set the sheet number to the api number and continue
      sheet.setNumberOfEvents(api_num_events);

      continue;
    }

    // If there are more events now than what there was before, add that event to the email
    Logger.log("Number of events shown in the sheet: " + sheet_num_events)
    if (api_num_events > sheet_num_events || sheet_num_events == undefined) {
      sheet.setNumberOfEvents(k, api_num_events);
      events_to_email.push(event.keyword + " has a new show in " + event.state + ", " + event.country);
      for (var api_event in api_events) {
        var name = "";
        var location = "";
        var date = "";
        var url = "";
        if ('name' in api_events[api_event]) {
          var name = api_events[api_event]['name'];
        }
        if('_embedded' in api_events[api_event]) {
          if ('venues' in api_events[api_event]['_embedded']) {
            if ('city' in api_events[api_event]['_embedded']['venues'][0] &&
                'state' in api_events[api_event]['_embedded']['venues'][0]) {
              if ('name' in api_events[api_event]['_embedded']['venues'][0]['city'] &&
                  'name' in api_events[api_event]['_embedded']['venues'][0]['state']) {
                var location = api_events[api_event]['_embedded']['venues'][0]['city']['name'] + ", " +
                               api_events[api_event]['_embedded']['venues'][0]['state']['name']
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
