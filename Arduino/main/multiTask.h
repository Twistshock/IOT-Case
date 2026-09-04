#ifndef MULTI_H
#define MULTI_H

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include "updateData.h"

// Update tracker data every 5 seconds
constexpr uint32_t TRACKER_UPDATE_INTERVAL_MS = 5000;

void SaveTrackerDataTask(void *pvParameters)
{
    (void)pvParameters;

    TickType_t lastWakeTime = xTaskGetTickCount();

    for (;;)
    {
        SaveTrackerData();

        // Wait until the next 5-second interval
        vTaskDelayUntil(
            &lastWakeTime,
            pdMS_TO_TICKS(TRACKER_UPDATE_INTERVAL_MS)
        );
    }
}

void MultitaskInit()
{
    BaseType_t taskCreated = xTaskCreate(
        SaveTrackerDataTask,   // Task function
        "SaveTrackerDataTask", // Task name
        4096,                  // Stack size in bytes
        nullptr,               // Parameters
        1,                     // Priority
        nullptr                // Task handle
    );

    if (taskCreated != pdPASS)
    {
        Serial.println("Failed to create SaveTrackerDataTask!");
    }
}

#endif // MULTI_H