#ifndef TIME_SYNC_H
#define TIME_SYNC_H

#include <Arduino.h>
#include <sys/time.h>
#include <time.h>

// =====================================================
// TIME SYNC
//
// The ESP32 has no clock of its own. The phone sends the
// time as a Unix epoch (seconds since 1970, UTC) when it
// connects, and from then on the ESP32 counts on its own.
//
// A full power loss wipes it again, because there is no
// battery-backed RTC. Until the phone reconnects the time
// is unknown, and GetEpoch() returns 0 to say so.
// =====================================================

// True once the phone has given us a time we trust
inline bool TIME_IS_SET = false;

// Sanity limits for a time from the phone: 2020-01-01 and 2100-01-01.
// The upper one catches the common mistake of sending Date.now(),
// which is milliseconds - a thousand times too big.
const time_t MIN_EPOCH = 1577836800;
const time_t MAX_EPOCH = 4102444800;

// Call once in setup(), before anything reads or formats a time.
// Every conversion here works in UTC, which is what the phone sends.
inline void TimeSyncInit()
{
    setenv("TZ", "UTC0", 1);
    tzset();
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

    TIME_IS_SET = true;

    return true;
}

// The time right now, or 0 when the phone has not synced yet.
// 0 means "unknown" - it does not mean 1970.
inline time_t GetEpoch()
{
    if (!TIME_IS_SET)
        return 0;

    return time(nullptr);
}

inline bool IsTimeSet()
{
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
inline String FormatEpoch(time_t epoch, const char *pattern)
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

    return FormatEpoch(epoch, "%d/%m/%Y");
}

// 1788344428 -> "10:20:28"
inline String EpochToClock(time_t epoch)
{
    if (epoch <= 0)
        return "--:--:--";

    return FormatEpoch(epoch, "%H:%M:%S");
}

// 1788344428 -> "02/09/2026 10:20:28"
inline String EpochToDateTime(time_t epoch)
{
    if (epoch <= 0)
        return "--/--/-- --:--:--";

    return FormatEpoch(epoch, "%d/%m/%Y %H:%M:%S");
}

// 1788344428 -> "2026-09-02T10:20:28Z", the full moment for anything we store.
// Empty when unknown, so a record is never given a made-up time.
inline String EpochToIso(time_t epoch)
{
    return FormatEpoch(epoch, "%Y-%m-%dT%H:%M:%SZ");
}

// 1788344428 -> "2026-09-02", the day a stored record belongs to.
// Year first so the days sort as plain text, unlike EpochToDate's
// "%d/%m/%Y". Empty when the time is unknown, and a record with no
// day cannot be filed, so callers have to check.
inline String EpochToIsoDate(time_t epoch)
{
    return FormatEpoch(epoch, "%Y-%m-%d");
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
