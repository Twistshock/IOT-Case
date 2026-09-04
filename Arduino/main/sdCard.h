#include <Arduino.h>
#include <SPI.h>
#include <SD.h>

#define SD_CS   5
#define SD_SCK  18
#define SD_MISO 19
#define SD_MOSI 23

void SdCardSetup()
{

    Serial.println("Starting SD-card test...");

    SPI.begin(SD_SCK, SD_MISO, SD_MOSI, SD_CS);

    if (!SD.begin(SD_CS, SPI))
    {
        Serial.println("SD card initialization FAILED!");
        Serial.println("Check wiring, power and FAT32 formatting.");
        return;
    }

    Serial.println("SD card initialized successfully!");

    uint8_t cardType = SD.cardType();

    if (cardType == CARD_NONE)
    {
        Serial.println("No SD card inserted.");
        return;
    }

    Serial.print("Card type: ");

    if (cardType == CARD_MMC)
        Serial.println("MMC");
    else if (cardType == CARD_SD)
        Serial.println("SDSC");
    else if (cardType == CARD_SDHC)
        Serial.println("SDHC");
    else
        Serial.println("Unknown");

    uint64_t cardSizeMB = SD.cardSize() / (1024ULL * 1024ULL);

    Serial.print("Card size: ");
    Serial.print(cardSizeMB);
    Serial.println(" MB");

    // Write a test file
    File file = SD.open("/test.txt", FILE_WRITE);

    if (!file)
    {
        Serial.println("Could not create test.txt");
        return;
    }

    file.println("Hello from NodeMCU-32S!");
    file.println("The SD card is working.");
    file.close();

    Serial.println("Data written to /test.txt");

    // Read the test file
    file = SD.open("/test.txt", FILE_READ);

    if (!file)
    {
        Serial.println("Could not open test.txt");
        return;
    }

    Serial.println("File contents:");

    while (file.available())
    {
        Serial.write(file.read());
    }

    file.close();

    Serial.println("\nSD-card test completed successfully!");
}
