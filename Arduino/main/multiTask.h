#ifndef MULTI_H
#define MULTI_H

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/semphr.h>

#include "updateData.h"
#include "timeSync.h"

// Save tracker data every 60 seconds
constexpr uint32_t TRACKER_SAVE_INTERVAL_MS = 60000;

// Update/synchronize SD card data every 5 seconds
constexpr uint32_t SDCARD_UPDATE_INTERVAL_MS = 5000;

// Prevent both tasks from accessing the SD card simultaneously
static SemaphoreHandle_t sdCardMutex = nullptr;

void SaveTrackerDataTask(void *pvParameters)
{
    (void)pvParameters;

    TickType_t lastWakeTime = xTaskGetTickCount();

    for (;;)
    {
        if (xSemaphoreTake(sdCardMutex, portMAX_DELAY) == pdTRUE)
        {
            SaveTrackerData();
            xSemaphoreGive(sdCardMutex);
        }

        vTaskDelayUntil(
            &lastWakeTime,
            pdMS_TO_TICKS(TRACKER_SAVE_INTERVAL_MS)
        );
    }
}

void UpdateDataSDCardTask(void *pvParameters)
{
    (void)pvParameters;

    TickType_t lastWakeTime = xTaskGetTickCount();

    for (;;)
    {
        if (xSemaphoreTake(sdCardMutex, portMAX_DELAY) == pdTRUE)
        {
            UpdateDataSDCard();
            xSemaphoreGive(sdCardMutex);
        }

        vTaskDelayUntil(
            &lastWakeTime,
            pdMS_TO_TICKS(SDCARD_UPDATE_INTERVAL_MS)
        );
    }
}

void MultitaskInit()
{
    sdCardMutex = xSemaphoreCreateMutex();

    if (sdCardMutex == nullptr)
    {
        Serial.println("Failed to create SD card mutex!");
        return;
    }

    BaseType_t saveTaskResult = xTaskCreate(
        SaveTrackerDataTask,
        "SaveTrackerData",
        4096,
        nullptr,
        1,
        nullptr
    );

    if (saveTaskResult != pdPASS)
    {
        Serial.println("Failed to create SaveTrackerDataTask!");
    }

    BaseType_t updateTaskResult = xTaskCreate(
        UpdateDataSDCardTask,
        "UpdateDataSD",
        4096,
        nullptr,
        1,
        nullptr
    );

    if (updateTaskResult != pdPASS)
    {
        Serial.println("Failed to create UpdateDataSDCardTask!");
    }
}

#endif 