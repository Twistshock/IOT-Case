#ifndef SDCARD_H
#define SDCARD_H

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <ArduinoJson.h>

#include "config.h"
#include "timeSync.h"
#include "ble.h"

#define SD_CS   5
#define SD_SCK  18
#define SD_MISO 19
#define SD_MOSI 23

SPIClass sdSPI(VSPI);

const char* USER_FILE_PATH = "/user.json";
const char* TRACKER_FILE_PATH = "/tracker.json";

// A save rewrites the whole file, so it is built here first and renamed over
// tracker.json once it is complete. A reset mid-write then costs the newest
// save instead of the entire history.
const char* TRACKER_TEMP_PATH = "/tracker.tmp";

// =====================================================
// USER FILE
// =====================================================


struct TrackerData
{
    String date;        // "2026-09-08", the day this record covers
    String timestamp;   // "2026-09-08T10:20:28Z", when it was last written
    uint32_t steps;
    float kcal;
    int heartRate;
    float spo2;
    float temperature;
    bool success;
};

bool saveUserData(
    const String& username,
    const String& timestamp
)
{
    JsonDocument json;

    json["username"] = username;
    json["timestamp"] = timestamp;

    File file = SD.open(USER_FILE_PATH, FILE_WRITE);

    if (!file)
    {
        Serial.println("Failed to open user.json for writing");
        return false;
    }

    bool success = serializeJsonPretty(json, file) > 0;
    file.close();

    if (success)
    {
        Serial.println("User data saved");
    }
    else
    {
        Serial.println("Failed to save user data");
    }

    return success;
}

bool readUserData(
    String& username,
    String& timestamp
)
{
    File file = SD.open(USER_FILE_PATH, FILE_READ);

    if (!file)
    {
        Serial.println("user.json does not exist");
        return false;
    }

    JsonDocument json;
    DeserializationError error = deserializeJson(json, file);

    file.close();

    if (error)
    {
        Serial.print("User JSON error: ");
        Serial.println(error.c_str());
        return false;
    }

    username = json["username"] | "";
    timestamp = json["timestamp"] | "";

    Serial.println("User data:");
    Serial.print("Username: ");
    Serial.println(username);
    Serial.print("Timestamp: ");
    Serial.println(timestamp);

    USERNAME = username;

    // The stored timestamp is when the phone last synced, not now. The device
    // was off in between and cannot tell for how long, so TIMESTAMP is left
    // unknown until the phone reconnects and starts the clock again.

    return true;
}

// =====================================================
// TRACKER FILE
//
// tracker.json holds one object per day, oldest first:
//
// [
//   { "date": "2026-09-07", "steps": 8421, ..., "synced": true },
//   { "date": "2026-09-08", "steps": 1203, ..., "synced": false }
// ]
//
// A save looks the current day up by its "date" and rewrites
// that one object, so a day is only ever stored once and the
// running totals stay attached to the day they were counted on.
//
// "synced" is how a day counted while the phone was away still
// reaches it later: the tracker keeps sending the days the phone
// has not been given yet, so the app can back-fill its database
// instead of only ever hearing about today.
// =====================================================

// How many days stay on the card. The whole file is parsed and rewritten on
// every save, so the history is capped to keep that cost from growing without
// end. The oldest days are dropped first.
constexpr size_t TRACKER_MAX_DAYS = 365;

// Reads tracker.json into json as an array of days.
//
// A missing, unparsable or wrongly shaped file yields an empty array instead
// of a failure: the day about to be written is worth more than history that
// can no longer be read, and refusing to save would lose that too. The return
// value says whether real days were loaded, for callers that care.
bool loadTrackerFile(JsonDocument& json)
{
    json.to<JsonArray>();

    File file = SD.open(TRACKER_FILE_PATH, FILE_READ);

    if (!file)
    {
        Serial.println("tracker.json does not exist");
        return false;
    }

    DeserializationError error = deserializeJson(json, file);
    file.close();

    if (error)
    {
        Serial.print("Tracker JSON error: ");
        Serial.println(error.c_str());

        json.to<JsonArray>();
        return false;
    }

    // Anything that is not an array is a file from before the data was
    // grouped by day. There is no day to file its single record under,
    // so it is started over rather than guessed at.
    if (!json.is<JsonArray>())
    {
        Serial.println("tracker.json is not a list of days, starting a new one");

        json.to<JsonArray>();
        return false;
    }

    return true;
}

// Writes the array of days out, replacing tracker.json only once the new
// contents are safely on the card
bool writeTrackerFile(JsonDocument& json)
{
    File file = SD.open(TRACKER_TEMP_PATH, FILE_WRITE);

    if (!file)
    {
        Serial.println("Failed to open tracker.tmp for writing");
        return false;
    }

    bool written = serializeJsonPretty(json, file) > 0;
    file.close();

    if (!written)
    {
        Serial.println("Failed to write tracker data");
        SD.remove(TRACKER_TEMP_PATH);
        return false;
    }

    // rename() will not overwrite, so the old file goes first. This is the
    // one moment the history is not on the card; it lasts a single call.
    SD.remove(TRACKER_FILE_PATH);

    if (!SD.rename(TRACKER_TEMP_PATH, TRACKER_FILE_PATH))
    {
        Serial.println("Failed to replace tracker.json");
        return false;
    }

    return true;
}

// Stores the current totals under the day the epoch falls on: the existing
// object for that day is updated, and a day that has none gets a new one.
bool saveTrackerData(
    time_t epoch,
    uint32_t steps,
    float kcal,
    int heartRate,
    float spo2,
    float temperature
)
{
    // Every record is filed under a day, so a record whose day is unknown
    // cannot be filed at all. Until the phone syncs, the counters stay in
    // RAM and the first save after the sync writes them out.
    const String date = EpochToIsoDate(epoch);
    const String timestamp = GetTimestamp();

    if (date.isEmpty())
    {
        Serial.println("Time not synced yet, tracker data not saved");
        return false;
    }

    JsonDocument json;
    loadTrackerFile(json);

    JsonArray days = json.as<JsonArray>();

    // Today is normally the last entry, but the phone can move the clock
    // backwards on a sync, so the whole array is searched.
    JsonObject day;

    for (JsonObject entry : days)
    {
        if (date == (entry["date"] | ""))
        {
            day = entry;
            break;
        }
    }

    const bool isNewDay = day.isNull();

    if (isNewDay)
        day = days.add<JsonObject>();

    day["date"] = date;
    day["timestamp"] = timestamp;
    day["steps"] = steps;
    day["kcal"] = kcal;
    day["heart_rate"] = heartRate;
    day["spo2"] = spo2;
    day["temperature"] = temperature;
    day["updated_at"] = EpochToIso(epoch);

    // These totals have not been sent anywhere yet. Today is re-sent on every
    // save regardless, but writing it here is what makes a day survive a
    // reboot still marked as owed to the phone.
    day["synced"] = false;

    // Days are appended in the order they happen, so the oldest is at the
    // front and trimming there drops the oldest first.
    while (days.size() > TRACKER_MAX_DAYS)
        days.remove(0);

    if (!writeTrackerFile(json))
        return false;

    if (isNewDay)
        Serial.printf("Started a new day in tracker.json: %s\n", date.c_str());
    else
        Serial.printf("Updated tracker.json for %s\n", date.c_str());

    return true;
}

// The record stored for one day. success stays false when that day has none,
// which is the normal state of a day the tracker has not saved on yet.
// A day with nothing in it. Every lookup starts here, so a miss is always
// reported the same way rather than as half-filled values.
TrackerData emptyTrackerData()
{
    return TrackerData{
        "",     // date
        "",     // timestamp
        0,      // steps
        0.0f,   // kcal
        0,      // heartRate
        0.0f,   // spo2
        0.0f,   // temperature
        false   // success
    };
}

// Copies one stored day out of the file
TrackerData trackerDataFromEntry(JsonObjectConst entry)
{
    TrackerData data = emptyTrackerData();

    data.date        = entry["date"] | "";
    data.timestamp   = entry["updated_at"] | "";
    data.steps       = entry["steps"] | 0;
    data.kcal        = entry["kcal"] | 0.0f;
    data.heartRate   = entry["heart_rate"] | 0;
    data.spo2        = entry["spo2"] | 0.0f;
    data.temperature = entry["temperature"] | 0.0f;
    data.success     = true;

    return data;
}

TrackerData getTrackerDataForDate(const String& date)
{
    TrackerData data = emptyTrackerData();

    if (date.isEmpty())
        return data;

    JsonDocument json;

    if (!loadTrackerFile(json))
        return data;

    for (JsonObjectConst entry : json.as<JsonArrayConst>())
    {
        if (date == (entry["date"] | ""))
            return trackerDataFromEntry(entry);
    }

    return data;
}

// The newest day on the card, whichever day that turns out to be. Used when
// there is no record for today: its readings are the last ones the tracker
// took, so they beat showing zeros. success = false when the card is empty.
TrackerData getLatestTrackerData()
{
    TrackerData data = emptyTrackerData();

    JsonDocument json;

    if (!loadTrackerFile(json))
        return data;

    JsonArrayConst days = json.as<JsonArrayConst>();

    if (days.size() == 0)
        return data;

    // Days are appended in the order they happen, so the last is the newest
    return trackerDataFromEntry(days[days.size() - 1].as<JsonObjectConst>());
}

// Today's record, or success = false when the time is unknown or the day
// has not been saved on yet
TrackerData getTrackerData()
{
    return getTrackerDataForDate(GetIsoDate());
}

// Reports the days on the card that are not today, with when each was last
// written and whether the phone has been given it.
//
// Purely a look - nothing is changed. It answers "is the old data actually
// there?", which is the first thing worth knowing when a day fails to turn up
// in the app: a day missing here never got saved, while a day sitting here
// marked as sent got as far as notify() and no further.
//
// Returns how many older days there are.
// {"type":"tracker_data_logs","data":}  - the message without its array
constexpr size_t TRACKER_LOG_OVERHEAD = 36;

size_t checkOldData()
{
    JsonDocument json;

    if (!loadTrackerFile(json))
    {
        Serial.println("checkOldData: no tracker data on the card");
        return 0;
    }

    JsonArrayConst days = json.as<JsonArrayConst>();
    const String today = GetIsoDate();

    // Without the date from the phone there is no "today" to compare against,
    // so every day would count as old. Saying so beats reporting a number
    // that only means "the card is not empty".
    if (today.isEmpty())
    {
        Serial.printf(
            "checkOldData: date not known yet, %u day(s) stored in total\n",
            (unsigned)days.size()
        );

        return 0;
    }

    // The older days themselves, in the same shape as a tracker_data record
    // so the app can put them through the parser it already has.
    JsonDocument oldData;
    JsonArray packed = oldData.to<JsonArray>();

    for (JsonObjectConst entry : days)
    {
        if (today == (entry["date"] | ""))
            continue;

        JsonObject day = packed.add<JsonObject>();

        day["date"] = entry["date"] | "";
        day["steps"] = entry["steps"] | 0;
        day["kcal"] = entry["kcal"] | 0.0f;
        day["heart_rate"] = entry["heart_rate"] | 0;
        day["spo2"] = entry["spo2"] | 0.0f;
        day["temperature"] = entry["temperature"] | 0.0f;
        day["updated_at"] = entry["updated_at"] | "";
    }

    const size_t oldDays = packed.size();

    if (oldDays == 0)
    {
        Serial.printf("checkOldData: nothing older than today (%s)\n", today.c_str());
        return 0;
    }

    Serial.printf(
        "checkOldData: %u day(s) older than today (%s):\n",
        (unsigned)oldDays,
        today.c_str()
    );

    for (JsonObjectConst entry : days)
    {
        const char* date = entry["date"] | "";

        if (today == date)
            continue;

        Serial.printf(
            "  %s  last written %s  steps %lu  %s\n",
            date,
            (const char*)(entry["updated_at"] | "unknown"),
            (unsigned long)(entry["steps"] | 0),
            (entry["synced"] | false) ? "already sent to the phone" : "still owed"
        );
    }

    // The count is still what this returns, but the message carries the days.
    // Sending the number alone would tell the app something was missing
    // without giving it anything it could store.
    if (!BLEIsSubscribed())
    {
        Serial.println("checkOldData: phone is not subscribed, log not sent");
        return oldDays;
    }

    const size_t budget = BLEMaxPayload();

    if (budget <= TRACKER_LOG_OVERHEAD)
    {
        Serial.println("checkOldData: BLE MTU too small to carry the log");
        return oldDays;
    }

    // Trimmed from the front, oldest first, until the array fits one
    // notification. This is a report and not the delivery path - nothing is
    // marked as sent here - so a day dropped now is still handed over by
    // SaveTrackerData() in its own time, and the newest are the ones most
    // worth having in the meantime.
    while (packed.size() > 0
        && measureJson(oldData) + TRACKER_LOG_OVERHEAD > budget)
    {
        packed.remove(0);
    }

    if (packed.size() == 0)
    {
        Serial.println("checkOldData: not even one day fits the MTU, log not sent");
        return oldDays;
    }

    if (packed.size() < oldDays)
    {
        Serial.printf(
            "checkOldData: only the newest %u of %u days fit the log message\n",
            (unsigned)packed.size(),
            (unsigned)oldDays
        );
    }

    String payload;
    serializeJson(oldData, payload);

    String message = "{\"type\":\"tracker_logs\""
        ",\"data\":" + payload +
        "}";

    BLESendMessage(message);

    return oldDays;
}

// Removes every stored day except today.
//
// Nothing calls this: only the app knows whether the older days actually
// reached its database, so the decision to throw them away belongs there.
// Call it once that is confirmed.
//
// Today is always kept - its totals are still being counted, and deleting it
// would reset the step counter on the next save. Returns how many days were
// removed, which can be ignored.
size_t deleteOldData()
{
    const String today = GetIsoDate();

    // With no date from the phone there is no "today" to keep, so every day
    // would look old and the whole card would go. Refusing is the only safe
    // answer - a delete on a guess cannot be undone.
    if (today.isEmpty())
    {
        Serial.println("deleteOldData: date not known yet, nothing deleted");
        return 0;
    }

    JsonDocument json;

    if (!loadTrackerFile(json))
    {
        Serial.println("deleteOldData: no tracker data on the card");
        return 0;
    }

    JsonArray days = json.as<JsonArray>();
    size_t removed = 0;

    // Walked backwards, so removing an entry does not shift the ones still
    // waiting to be looked at
    for (size_t i = days.size(); i > 0; i--)
    {
        JsonObjectConst entry = days[i - 1].as<JsonObjectConst>();

        const char* date = entry["date"] | "";

        if (today == date)
            continue;

        // A day the phone was never given is being thrown away here. The
        // caller may well mean it, but it is worth saying out loud, because
        // after this the only copy is gone.
        Serial.printf(
            "deleteOldData: removing %s (%s)\n",
            date,
            (entry["synced"] | false) ? "already sent" : "NOT yet sent to the phone"
        );

        days.remove(i - 1);
        removed++;
    }

    if (removed == 0)
    {
        Serial.printf("deleteOldData: nothing older than today (%s)\n", today.c_str());
        return 0;
    }

    if (!writeTrackerFile(json))
    {
        Serial.println("deleteOldData: failed to write the card");
        return 0;
    }

    Serial.printf(
        "deleteOldData: %u day(s) removed, today (%s) kept\n",
        (unsigned)removed,
        today.c_str()
    );

    return removed;
}

// Fills out with the days the phone still has to be given, oldest first:
// today, whose totals are still moving, plus every earlier day recorded
// while the phone was out of range or switched off.
//
// Stops before the array would outgrow maxBytes, so what comes back always
// fits one notification. Whatever did not fit is picked up on the next save,
// which is why the oldest go first - the backlog drains instead of being
// crowded out by today. Returns how many days were packed.
size_t buildDaysToSend(JsonDocument& out, size_t maxBytes)
{
    JsonArray packed = out.to<JsonArray>();

    JsonDocument json;

    if (!loadTrackerFile(json))
        return 0;

    const String today = GetIsoDate();

    for (JsonObject entry : json.as<JsonArray>())
    {
        const char* date = entry["date"] | "";

        // Today always goes, because the save just changed it
        if ((entry["synced"] | false) && today != date)
            continue;

        // "synced" is bookkeeping for the card, not something the phone needs
        JsonObject day = packed.add<JsonObject>();

        day["date"] = date;
        day["steps"] = entry["steps"] | 0;
        day["kcal"] = entry["kcal"] | 0.0f;
        day["heart_rate"] = entry["heart_rate"] | 0;
        day["spo2"] = entry["spo2"] | 0.0f;
        day["temperature"] = entry["temperature"] | 0.0f;
        day["updated_at"] = entry["updated_at"] | "";

        // Measured for real rather than estimated, and the day that pushed it
        // over is put back so the message stays a complete, parsable array.
        if (measureJson(out) > maxBytes)
        {
            packed.remove(packed.size() - 1);
            break;
        }
    }

    return packed.size();
}

// Records that the phone has been given these days, so they are not sent
// again once the backlog has drained.
//
// Today is deliberately never marked: its totals keep changing and it is sent
// again on the next save anyway, and leaving it alone means the common case -
// nothing but today to send - needs no second write to the card at all.
bool markDaysSynced(JsonDocument& sent)
{
    JsonDocument json;

    if (!loadTrackerFile(json))
        return false;

    const String today = GetIsoDate();

    JsonArray days = json.as<JsonArray>();
    bool changed = false;

    for (JsonObject sentDay : sent.as<JsonArray>())
    {
        const char* date = sentDay["date"] | "";

        if (today == date)
            continue;

        for (JsonObject entry : days)
        {
            if (strcmp(date, entry["date"] | "") != 0)
                continue;

            if (!(entry["synced"] | false))
            {
                entry["synced"] = true;
                changed = true;

                Serial.printf("%s has reached the phone\n", date);
            }

            break;
        }
    }

    if (!changed)
        return true;

    return writeTrackerFile(json);
}

// One day's record as the JSON object the phone is sent
String trackerDataToJson(const TrackerData& data)
{
    JsonDocument json;

    json["date"] = data.date;
    json["steps"] = data.steps;
    json["kcal"] = data.kcal;
    json["heart_rate"] = data.heartRate;
    json["spo2"] = data.spo2;
    json["temperature"] = data.temperature;
    json["updated_at"] = data.timestamp;

    String out;
    serializeJson(json, out);

    return out;
}

// Puts today's stored totals back into the globals, so a reboot part way
// through a day carries on from where it left off instead of from zero.
//
// This can only work once the phone has told us the date, so it does nothing
// at boot and is called again from the sync handler.
bool readTrackerData()
{
    TrackerData data = getTrackerData();

    if (!data.success)
    {
        // No record for today - either the phone has not given us the date
        // yet, or this is the first save of a new day. The newest day on the
        // card still holds the last readings the sensors took, and those are
        // worth more on the screen than zeros.
        TrackerData latest = getLatestTrackerData();

        if (!latest.success)
        {
            Serial.println("No tracker records at all, counters start at zero");
            return false;
        }

        // Only the readings carry over. steps and kcal are totals for the day
        // they were counted on: showing yesterday's total as today's would be
        // wrong on its own, and the next save would then write that total
        // into today's record and make the error permanent on the card.
        HEART_RATE = latest.heartRate;
        BLOOD_OXYGEN = latest.spo2;
        TEMPERATURE = latest.temperature;

        STEPS = latest.steps;
        BURNED_KCAL = latest.kcal;

        Serial.printf(
            "No record for today. Last readings are from %s, "
            "step and kcal counters start at zero\n",
            latest.date.c_str()
        );

        return false;
    }

    Serial.println("Tracker data for today:");
    Serial.print("Date: ");
    Serial.println(data.date);
    Serial.print("Steps: ");
    Serial.println(data.steps);
    Serial.print("Kcal: ");
    Serial.println(data.kcal, 2);
    Serial.print("Heart rate: ");
    Serial.println(data.heartRate);
    Serial.print("SpO2: ");
    Serial.println(data.spo2, 1);
    Serial.print("Temperature: ");
    Serial.println(data.temperature, 1);

    STEPS = data.steps;
    BURNED_KCAL = data.kcal;
    HEART_RATE = data.heartRate;
    BLOOD_OXYGEN = data.spo2;
    TEMPERATURE = data.temperature;

    return true;
}

// =====================================================
// CREATE FILES IF MISSING
// =====================================================

void createFilesIfMissing()
{
    if (!SD.exists(USER_FILE_PATH))
    {
        Serial.println("Creating user.json...");
        saveUserData("", "");
    }
    else
    {
        Serial.println("user.json already exists");
    }

    if (!SD.exists(TRACKER_FILE_PATH))
    {
        Serial.println("Creating tracker.json...");

        // No day has been recorded yet, so the file starts as an empty list.
        // A placeholder record would need a date the tracker does not have.
        JsonDocument json;
        json.to<JsonArray>();

        writeTrackerFile(json);
    }
    else
    {
        Serial.println("tracker.json already exists");
    }
}

void SdCardSetup()
{
    sdSPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);

    if (!SD.begin(SD_CS, sdSPI, 1000000))
    {
        Serial.println("SD card initialization failed");
        return;
    }

    Serial.println("SD card ready");

    createFilesIfMissing();

    // Variables receiving data from the file
    String username;
    String userTimestamp;

    readUserData(username, userTimestamp);

    // The date is still unknown here, so this finds nothing on a cold boot.
    // HandleaSyncDevice() calls it again once the phone has set the clock.
    readTrackerData();
}



#endif
