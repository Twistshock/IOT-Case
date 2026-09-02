#ifndef MOVEMENT_READER_H
#define MOVEMENT_READER_H

#include <Arduino.h>
#include <math.h>


// Public fitness values
uint32_t STEPS = 0;
float BURNED_KCAL = 0.0f;

// Step-detection state
unsigned long lastStepTime = 0;
unsigned long lastMovementTime = 0;

float gravityEstimate = 0.0f;
bool aboveThreshold = false;

// Adjust these values after testing your accelerometer
const float STEP_THRESHOLD = 120.0f;
const float RESET_THRESHOLD = 50.0f;

const unsigned long MIN_STEP_INTERVAL = 250;
const unsigned long MAX_STEP_INTERVAL = 1500;

// Approximate calories burned per step
const float KCAL_PER_STEP = 0.04f;

// True while steps are still arriving, used to pick the heart-rate interval
inline bool IsWalking()
{
    if (lastMovementTime == 0)
        return false;

    return (millis() - lastMovementTime) < MAX_STEP_INTERVAL;
}

void detectStep(int16_t x, int16_t y, int16_t z)
{
    /*
     * Total acceleration:
     *
     * a = sqrt(x² + y² + z²)
     */
    float accelerationMagnitude = sqrtf(
        ((float)x * (float)x) +
        ((float)y * (float)y) +
        ((float)z * (float)z)
    );

    // Initialize the gravity estimate using the first measurement
    if (gravityEstimate == 0.0f)
    {
        gravityEstimate = accelerationMagnitude;
        return;
    }

    /*
     * Low-pass filter:
     * Slowly follows gravity and device orientation.
     */
    gravityEstimate =
        (gravityEstimate * 0.90f) +
        (accelerationMagnitude * 0.10f);

    // Remove the estimated gravity component
    float movement =
        fabsf(accelerationMagnitude - gravityEstimate);

    unsigned long currentTime = millis();

    /*
     * Count a step when:
     * 1. Movement crosses the step threshold.
     * 2. The previous peak has ended.
     * 3. Enough time has passed since the previous step.
     */
    if (movement > STEP_THRESHOLD && !aboveThreshold)
    {
        aboveThreshold = true;

        unsigned long timeSinceLastStep =
            currentTime - lastStepTime;

        if (timeSinceLastStep >= MIN_STEP_INTERVAL)
        {
            STEPS++;
            lastStepTime = currentTime;
            lastMovementTime = currentTime;

            BURNED_KCAL = STEPS * KCAL_PER_STEP;

            Serial.print("STEP! Total: ");
            Serial.print(STEPS);

            Serial.print(" | Burned kcal: ");
            Serial.println(BURNED_KCAL, 2);
        }
    }

    // Movement must fall below this value before a new peak counts
    if (movement < RESET_THRESHOLD)
    {
        aboveThreshold = false;
    }

    bool walking = IsWalking();

    if (walking)
    {
        Serial.print("Acceleration: ");
        Serial.print(accelerationMagnitude);

        Serial.print(" | Movement: ");
        Serial.print(movement);

        Serial.print(" | Steps: ");
        Serial.print(STEPS);

        Serial.print(" | Walking: ");
        Serial.println(walking ? 1 : 0);
        Serial.print(" | Walking: ");
        Serial.println(walking ? 1 : 0);

    }
}

#endif