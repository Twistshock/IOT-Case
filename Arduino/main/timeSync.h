#ifndef TIME_SYNC_H
#define TIME_SYNC_H

#include <Arduino.h>
#include <sys/time.h>
#include <time.h>

#include "RTC.h"

// =====================================================
// TIME SYNC
//
// The ESP32 has no clock of its own. The phone sends the
// time as a Unix epoch (seconds since 1970, UTC) when it
// connects, and from then on the ESP32 counts on its own.
//
// A battery-backed PCF8523 is now the clock the tracker
// runs on. SaveTime() writes every synced time through to
// it, and every function here that asks for "now" goes
// through GetEpoch(), which reads the module back into the
// system clock before answering.
//
// The system clock is not a second source of truth - it is
// the carrier between RTC reads. Those are rate limited to
// one a second, because the module only ticks in whole
// seconds and it shares the I2C bus with the display.
//
// The EpochToX() converters take a moment as an argument
// rather than asking for one, so they never touch the RTC:
// they are for turning a stored timestamp back into text.
//
// If the module has lost power and the phone has not synced,
// the time is unknown and GetEpoch() returns 0 to say so.
// =====================================================

// =====================================================
// TIME ZONE
//
// The phone sends a UTC epoch and the RTC stores UTC, which
// is what makes a stored moment comparable to any other.
// Only the reading of it is local.
//
// POSIX TZ format, and the sign is inverted from what you
// would expect: "CET-1" means one hour EAST of UTC. The two
// M rules are the daylight saving switchover - last Sunday
// in March, last Sunday in October at 03:00 - so the clock
// follows DST on its own instead of drifting an hour twice
// a year.
//
// Some others, if this is the wrong zone:
//   UTC                "UTC0"
//   UK                 "GMT0BST,M3.5.0/1,M10.5.0"
//   Vietnam (no DST)   "ICT-7"
//   US Eastern         "EST5EDT,M3.2.0,M11.1.0"
//   Fixed +2, no DST   "XXX-2"
// =====================================================

constexpr const char *DEVICE_TZ = "CET-1CEST,M3.5.0,M10.5.0/3";

// True once the RTC or the phone has given us a time we trust
inline bool TIME_IS_SET = false;

// The task allowed to read the RTC, filled in by TimeSyncInit(). Only the task
// that drives the display may touch the shared I2C bus; see RefreshFromRTC().
inline TaskHandle_t timeSyncOwnerTask = nullptr;

// When the RTC was last read, and how often it is worth doing. The module
// ticks in whole seconds, so a shorter interval buys nothing.
inline unsigned long lastRTCRead = 0;
constexpr unsigned long RTC_READ_INTERVAL = 1000;

// Sanity limits for a time from the phone: 2020-01-01 and 2100-01-01.
// The upper one catches the common mistake of sending Date.now(),
// which is milliseconds - a thousand times too big.
const time_t MIN_EPOCH = 1577836800;
const time_t MAX_EPOCH = 4102444800;

// Defined further down with the other formatters; only needed here to log
// the restored time as something readable.
inline String EpochToIso(time_t epoch);

// The RTC's time as a Unix epoch, or 0 when it holds nothing worth trusting.
//
// A PCF8523 that has lost power still reports a time - whatever it stopped at -
// so the flag has to be checked rather than the value alone. Everything stored
// is filed under a day, so no time at all beats a plausible wrong one.
// Whether the module was usable last time it was asked. This is now read once
// a second, so complaining every time would bury the log; it only speaks up
// when the answer changes.
inline bool rtcWasUsable = true;

inline time_t ReadRTCEpoch()
{
    if (!rtc.initialized() || rtc.lostPower())
    {
        if (rtcWasUsable)
        {
            Serial.println("RTC has no time set, waiting for the phone");
            rtcWasUsable = false;
        }

        return 0;
    }

    const time_t epoch = (time_t)rtc.now().unixtime();

    // The same range the phone is held to. A module with a flat backup cell
    // can read back as 2000-01-01, which this catches.
    if (epoch < MIN_EPOCH || epoch > MAX_EPOCH)
    {
        if (rtcWasUsable)
        {
            Serial.printf("RTC time %ld is out of range, ignoring\n", (long)epoch);
            rtcWasUsable = false;
        }

        return 0;
    }

    rtcWasUsable = true;

    return epoch;
}

// Call once in setup(), before anything reads or formats a time, and after
// RTCSetup() - main.ino calls it immediately after.
//
// Every conversion here works in UTC, which is what the phone sends and what
// the RTC is written with.
inline void TimeSyncInit()
{
    setenv("TZ", DEVICE_TZ, 1);
    tzset();

    // setup() and loop() are the same FreeRTOS task, so this is the task that
    // drives the OLED - and therefore the only one allowed to touch the shared
    // I2C bus. See RefreshFromRTC().
    timeSyncOwnerTask = xTaskGetCurrentTaskHandle();

    const time_t epoch = ReadRTCEpoch();

    if (epoch == 0)
        return;

    struct timeval now;
    now.tv_sec = epoch;
    now.tv_usec = 0;

    settimeofday(&now, nullptr);

    TIME_IS_SET = true;

    Serial.printf(
        "Time restored from the RTC: %s\n",
        EpochToIso(epoch).c_str()
    );
}

// Start the clock from the epoch the phone sent
inline bool SaveTime(time_t epoch)
{
    if (epoch < MIN_EPOCH)
    {
        Serial.printf("Time %ld is too old, ignoring\n", (long)epoch);
        return false;
    }

    if (epoch > MAX_EPOCH)
    {
        Serial.printf("Time %ld looks like milliseconds, send seconds\n", (long)epoch);
        return false;
    }

    struct timeval now;
    now.tv_sec = epoch;
    now.tv_usec = 0;

    settimeofday(&now, nullptr);

    // Written through to the RTC as well, so the next boot starts with the
    // time already known instead of waiting for the phone. This also clears
    // the module's lost-power flag, which is what makes ReadRTCEpoch() trust
    // it afterwards.
    rtc.adjust(DateTime((uint32_t)epoch));

    TIME_IS_SET = true;

    return true;
}

// Pulls the system clock back into line with the RTC, so the module is the
// source of truth and the ESP32's own counter never drifts away from it.
//
// Rate limited to once a second because the PCF8523 only ticks in whole
// seconds - asking more often costs an I2C transaction and returns the same
// number. Between reads the system clock carries the time, which is what keeps
// GetEpoch() cheap enough to call several times a frame.
//
// Only the task that owns the bus does the read. The RTC shares I2C with the
// OLED, and Arduino's TwoWire keeps one transmit buffer for the whole bus, so
// a read from the SD card task landing in the middle of a frame would corrupt
// both. Other tasks get the system clock, which this keeps corrected to within
// a second of the module.
inline void RefreshFromRTC()
{
    if (timeSyncOwnerTask == nullptr
        || xTaskGetCurrentTaskHandle() != timeSyncOwnerTask)
    {
        return;
    }

    if (lastRTCRead != 0 && millis() - lastRTCRead < RTC_READ_INTERVAL)
        return;

    lastRTCRead = millis();

    const time_t epoch = ReadRTCEpoch();

    // Nothing usable in the module. Whatever the phone set is still running in
    // the system clock, so the tracker carries on rather than losing the time.
    if (epoch == 0)
        return;

    struct timeval now;
    now.tv_sec = epoch;
    now.tv_usec = 0;

    settimeofday(&now, nullptr);

    TIME_IS_SET = true;
}

// The time right now, or 0 when neither the RTC nor the phone has given us
// one. 0 means "unknown" - it does not mean 1970.
inline time_t GetEpoch()
{
    // The module first: this is what makes the RTC the clock the tracker runs
    // on, rather than a copy that is only consulted at boot.
    RefreshFromRTC();

    if (!TIME_IS_SET)
        return 0;

    return time(nullptr);
}

inline bool IsTimeSet()
{
    // Asked through the module like every other getter, so a caller can never
    // be told the time is unknown while the RTC is holding a good one.
    RefreshFromRTC();

    return TIME_IS_SET;
}

// =====================================================
// EPOCH -> TEXT
//
// These take an epoch, so they work on any moment - not
// only "now". That means a timestamp read back from the
// SD card can be turned into text the same way.
//
// An epoch of 0 means the time was never known, so each
// one answers with placeholders instead of pretending
// the moment was 1970.
// =====================================================

// Turns an epoch into text using the given strftime pattern
// The moment as the wearer would read it off a wall clock, in DEVICE_TZ
inline String FormatEpochLocal(time_t epoch, const char *pattern)
{
    if (epoch <= 0)
        return "";

    struct tm parts;
    localtime_r(&epoch, &parts);

    char text[32];
    strftime(text, sizeof(text), pattern, &parts);

    return String(text);
}

// The same moment in UTC, for anything written down. A stored timestamp has to
// mean the same thing wherever it is read, and the phone's database is not in
// this device's time zone.
inline String FormatEpochUtc(time_t epoch, const char *pattern)
{
    if (epoch <= 0)
        return "";

    struct tm parts;
    gmtime_r(&epoch, &parts);

    char text[32];
    strftime(text, sizeof(text), pattern, &parts);

    return String(text);
}

// 1788344428 -> "02/09/2026"
inline String EpochToDate(time_t epoch)
{
    if (epoch <= 0)
        return "--/--/--";

    return FormatEpochLocal(epoch, "%d/%m/%Y");
}

// 1788344428 -> "10:20:28"
inline String EpochToClock(time_t epoch)
{
    if (epoch <= 0)
        return "--:--:--";

    return FormatEpochLocal(epoch, "%H:%M:%S");
}

// 1788344428 -> "02/09/2026 10:20:28"
inline String EpochToDateTime(time_t epoch)
{
    if (epoch <= 0)
        return "--/--/-- --:--:--";

    return FormatEpochLocal(epoch, "%d/%m/%Y %H:%M:%S");
}

// 1788344428 -> "2026-09-02T10:20:28Z", the full moment for anything we store.
// Deliberately UTC, because the trailing Z says so and the phone's database
// has to be able to compare it against records from anywhere.
// Empty when unknown, so a record is never given a made-up time.
inline String EpochToIso(time_t epoch)
{
    return FormatEpochUtc(epoch, "%Y-%m-%dT%H:%M:%SZ");
}

// 1788344428 -> "2026-09-02", the day a stored record belongs to.
//
// Local, unlike EpochToIso above. A day of steps is the wearer's day: it has to
// start and end at midnight where they are, or an evening walk lands in
// tomorrow's total. The moment inside each record stays UTC; only which day it
// is filed under is local.
//
// Year first so the days sort as plain text, unlike EpochToDate's "%d/%m/%Y".
// Empty when the time is unknown, and a record with no day cannot be filed, so
// callers have to check.
inline String EpochToIsoDate(time_t epoch)
{
    return FormatEpochLocal(epoch, "%Y-%m-%d");
}

// =====================================================
// THE TIME RIGHT NOW, AS TEXT
// =====================================================

// "02/09/2026" for the watch face
inline String GetDate()
{
    return EpochToDate(GetEpoch());
}

// "10:20:28" for the watch face
inline String GetClock()
{
    return EpochToClock(GetEpoch());
}

// "02/09/2026 10:20:28"
inline String GetDateTime()
{
    return EpochToDateTime(GetEpoch());
}

// "2026-09-02T10:20:28Z" for anything we store
inline String GetTimestamp()
{
    return EpochToIso(GetEpoch());
}

// "2026-09-02", the day today's tracker record is filed under
inline String GetIsoDate()
{
    return EpochToIsoDate(GetEpoch());
}

#endif
