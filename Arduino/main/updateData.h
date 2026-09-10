#ifndef UPDATE_DATA_H
#define UPDATE_DATA_H

#include <Arduino.h>
#include "sdCard.h"
#include "config.h"
#include "heartRate.h"
#include "timeSync.h"
#include "ble.h"


// The message the days travel in: {"type":"tracker_data","data":[ ... ]}
// Everything except the array itself, which is what the array has to fit
// inside the MTU alongside.
constexpr size_t TRACKER_MESSAGE_OVERHEAD = 31;

// Writes the running totals into today's record on the card and pushes the
// days the phone is still owed. Called on a timer, so it runs many times a
// day and keeps overwriting the same object until midnight starts a new one.
void SaveTrackerData()
{
    const time_t epoch = GetEpoch();

    // A save with no known day is refused, and there is nothing to report
    // to the phone either - it would not know which day it belonged to.
    if (!saveTrackerData(
            epoch,
            STEPS,
            BURNED_KCAL,
            HEART_RATE,
            BLOOD_OXYGEN,
            TEMPERATURE
        ))
    {
        return;
    }
    Serial.println("Saving data to SD-Card.");

    // Nothing listening, so nothing is marked as delivered either. The days
    // stay owed on the card and go out once the phone has subscribed.
    //
    // This is deliberately the subscription and not just the connection: the
    // backlog is crossed off once it is sent, so sending it into the gap
    // between connecting and subscribing would lose it for good.
    if (!BLEIsSubscribed())
        return;

    const size_t payloadBudget = BLEMaxPayload();

    if (payloadBudget <= TRACKER_MESSAGE_OVERHEAD)
    {
        Serial.println("BLE MTU too small to carry a day, nothing sent");
        return;
    }

    // Today plus any backlog - as many whole days as one notification holds
    JsonDocument days;

    if (buildDaysToSend(days, payloadBudget - TRACKER_MESSAGE_OVERHEAD) == 0)
        return;

    String payload;
    serializeJson(days, payload);

    String message = "{\"type\":\"tracker_data\""
        ",\"data\":" + payload +
        "}";

    Serial.println("Saving data to DB.");

    // Only days that actually went out are crossed off, so a refused or
    // failed send leaves them owed rather than quietly dropping them.
    if (BLESendMessage(message))
        markDaysSynced(days);
}

void UpdateDataSDCard()
{
    const time_t epoch = GetEpoch();

    // A save with no known day is refused, and there is nothing to report
    // to the phone either - it would not know which day it belonged to.
    if (!saveTrackerData(
            epoch,
            STEPS,
            BURNED_KCAL,
            HEART_RATE,
            BLOOD_OXYGEN,
            TEMPERATURE
        ))
    {
        return;
    }
    Serial.println("Saving data to SD-Card.");
}


#endif
