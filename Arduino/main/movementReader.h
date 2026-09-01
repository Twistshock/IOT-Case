#ifndef MOVEMENT_READER_H
#define MOVEMENT_READER_H


#include <math.h>

uint32_t STEPS = 0;
float BRUNED_KCAL = 0.0f;

unsigned long stepCount = 0;
unsigned long lastStepTime = 0;
unsigned long lastMovementTime = 0;


float gravityEstimate = 0;
bool aboveThreshold = false;

const float STEP_THRESHOLD = 120.0;
const float RESET_THRESHOLD = 50.0;

const unsigned long MIN_STEP_INTERVAL = 250;
const unsigned long MAX_STEP_INTERVAL = 1500;

void detectStep(int16_t x, int16_t y, int16_t z)
{
    float magnitude = sqrt(
        (float)x * x +
        (float)y * y +
        (float)z * z
    );

    // Estimate and remove the gravity component
    if (gravityEstimate == 0)
        gravityEstimate = magnitude;

    gravityEstimate =
        (gravityEstimate * 0.90) +
        (magnitude * 0.10);

    float movement = fabs(magnitude - gravityEstimate);
    unsigned long currentTime = millis();

    // Detect the beginning of an acceleration peak
    if (movement > STEP_THRESHOLD && !aboveThreshold)
    {
        aboveThreshold = true;

        unsigned long timeSinceLastStep =
            currentTime - lastStepTime;

        if (timeSinceLastStep >= MIN_STEP_INTERVAL)
        {
            stepCount++;
            lastStepTime = currentTime;
            lastMovementTime = currentTime;

            Serial.print("STEP! Total: ");
            Serial.println(stepCount);
            STEPS = stepCount + STEPS;
        }
    }

    // The signal must fall before another step can be counted
    if (movement < RESET_THRESHOLD)
    {
        aboveThreshold = false;
    }

    bool walking =
        currentTime - lastMovementTime < MAX_STEP_INTERVAL;


    if(walking != 0){
      Serial.print("Movement:");
      Serial.print(movement);

      Serial.print(",Steps:");
      Serial.print(stepCount);

      Serial.print(",Walking:");
      Serial.println(walking ? 1 : 0);
    }
}

#endif