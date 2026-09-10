#ifndef BLE_H
#define BLE_H

#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#define BLE_DEVICE_NAME "Fitness Tracker V1.0"

#define SERVICE_UUID "12345678-1234-1234-1234-1234567890ab"

// Phone -> tracker (the app writes here)
#define CHARACTERISTIC_RX_UUID "abcdefab-1234-1234-1234-abcdefabcdef"

// Tracker -> phone (the app subscribes here)
#define CHARACTERISTIC_TX_UUID "abcdefab-1234-1234-1234-abcdefabcdf0"

// Incoming commands from the phone. Sized for the largest MTU we ask for,
// so the buffer holds a whole write plus its NUL.
constexpr size_t BLE_MESSAGE_SIZE = 520;

// The MTU we ask the phone for. 517 is the ceiling the ESP32 supports; the
// phone answers with something smaller and that answer is what counts.
constexpr uint16_t BLE_REQUESTED_MTU = 517;

// A stats payload carries every sensor value, so it needs more room
constexpr size_t BLE_PAYLOAD_SIZE = 128;

// How often the tracker pushes its stats to the phone. Notifying on every
// sensor sample floods the app, so the sending is paced from loop() instead.
constexpr unsigned long BLE_STATS_INTERVAL = 1000;

// Resend even when nothing changed, so a phone that just subscribed sees data
constexpr unsigned long BLE_STATS_KEEPALIVE = 5000;

inline BLECharacteristic *bleTxCharacteristic = nullptr;
inline bool BLE_CONNECTED = false;

// The notify characteristic's Client Characteristic Configuration descriptor.
// The phone writes it when it subscribes, which is the only signal we get
// that anything is actually listening.
inline BLE2902 *bleTxDescriptor = nullptr;

// What the phone actually agreed to, filled in by onMtuChanged(). Until that
// happens the BLE default of 23 is all that is safe to assume: a notification
// longer than the MTU is silently cut short, not rejected, so guessing high
// here would lose the tail of a message with no sign that anything went wrong.
inline uint16_t BLE_MTU = 23;

// Three bytes of every notification are the ATT header
inline size_t BLEMaxPayload()
{
    return BLE_MTU > 3 ? (size_t)(BLE_MTU - 3) : 0;
}

// Whether the phone has actually subscribed to notifications.
//
// Being connected is not the same thing: the phone connects, then discovers
// services, then subscribes, and that can take seconds. A notify() sent in
// that gap goes nowhere and reports no error, so anything that treats a send
// as delivery has to wait for this instead of for BLE_CONNECTED.
inline bool BLEIsSubscribed()
{
    return BLE_CONNECTED
        && bleTxDescriptor != nullptr
        && bleTxDescriptor->getNotifications();
}

// Written by the BLE task, read by BLEReadMessage() on the main task
inline volatile bool bleMessageWaiting = false;
inline char bleMessageBuffer[BLE_MESSAGE_SIZE] = {0};

// Send a message to the phone. False means nothing was sent, so a caller
// that is clearing a backlog knows not to treat those days as delivered.
inline bool BLESendMessage(const String &message)
{
    if (bleTxCharacteristic == nullptr)
        return false;

    // Sending before the phone has subscribed silently drops the message
    if (!BLEIsSubscribed())
    {
        Serial.println("Phone has not subscribed yet, nothing sent");
        return false;
    }

    // A notification past the MTU arrives truncated, which for JSON means the
    // phone gets an unparsable fragment. Refusing is the honest failure.
    if (message.length() > BLEMaxPayload())
    {
        Serial.printf(
            "BLE message is %u bytes, only %u fit in the MTU - not sent\n",
            message.length(),
            (unsigned)BLEMaxPayload()
        );

        return false;
    }

    Serial.println("Message is sent.");

    bleTxCharacteristic->setValue(message.c_str());
    bleTxCharacteristic->notify();

    return true;
}

// Read the message the phone sent, if there is one.
// Returns false when nothing new has arrived.
inline bool BLEReadMessage(String &message)
{
    if (!bleMessageWaiting)
        return false;

    message = String(bleMessageBuffer);
    bleMessageWaiting = false;

    return true;
}

class BLEConnectionCallbacks : public BLEServerCallbacks
{
    void onConnect(BLEServer *server)
    {
        BLE_CONNECTED = true;
    }

    void onDisconnect(BLEServer *server)
    {
        BLE_CONNECTED = false;

        // The next phone negotiates its own MTU, so the old one must not be
        // carried over - it may well be larger than what the next one allows.
        BLE_MTU = 23;

        // The next phone also has to subscribe for itself. Bluedroid leaves
        // the old CCCD value in place, which would otherwise read as a
        // subscription that no longer exists.
        if (bleTxDescriptor != nullptr)
            bleTxDescriptor->setNotifications(false);

        // Become discoverable again so the app can reconnect
        server->startAdvertising();
    }

#if defined(CONFIG_BLUEDROID_ENABLED)
    // The only place the real, agreed MTU can be learned
    void onMtuChanged(BLEServer *server, esp_ble_gatts_cb_param_t *param)
    {
        BLE_MTU = param->mtu.mtu;

        Serial.printf(
            "BLE MTU is %u, so %u bytes fit in one notification\n",
            BLE_MTU,
            (unsigned)BLEMaxPayload()
        );
    }
#endif
};

class BLEReceiveCallbacks : public BLECharacteristicCallbacks
{
    void onWrite(BLECharacteristic *characteristic)
    {
        // getValue() returns by value, so the String has to stay alive while
        // it is copied - c_str() on the temporary would dangle immediately.
        String data = characteristic->getValue();

        if (data.isEmpty())
            return;

        // Truncating here would hand messageHandler() half a JSON object,
        // so an oversized write is reported instead of parsed.
        if (data.length() >= BLE_MESSAGE_SIZE)
        {
            Serial.printf("BLE message too long (%u bytes), dropped\n", data.length());
            return;
        }

        strncpy(bleMessageBuffer, data.c_str(), BLE_MESSAGE_SIZE - 1);
        bleMessageBuffer[BLE_MESSAGE_SIZE - 1] = '\0';

        bleMessageWaiting = true;

        // This runs on the BLE stack task, so the message is only parked
        // here; loop() reads it out and parses it on the main task.
        Serial.println("Received new message..");
    }
};

inline void BLEDeviceInit()
{
    BLEDevice::init(BLE_DEVICE_NAME);

    // Bigger than the 23-byte default, so a few days of backlog fit in one
    // packet. This is a request; onMtuChanged() reports what was granted.
    BLEDevice::setMTU(BLE_REQUESTED_MTU);

    BLEServer *server = BLEDevice::createServer();
    server->setCallbacks(new BLEConnectionCallbacks());

    BLEService *service = server->createService(SERVICE_UUID);

    // Phone -> tracker
    BLECharacteristic *rxCharacteristic = service->createCharacteristic(
        CHARACTERISTIC_RX_UUID,
        BLECharacteristic::PROPERTY_WRITE |
        BLECharacteristic::PROPERTY_WRITE_NR
    );

    rxCharacteristic->setCallbacks(new BLEReceiveCallbacks());

    // Tracker -> phone
    bleTxCharacteristic = service->createCharacteristic(
        CHARACTERISTIC_TX_UUID,
        BLECharacteristic::PROPERTY_READ |
        BLECharacteristic::PROPERTY_NOTIFY
    );

    // Required so the app can turn notifications on. The pointer is kept so
    // BLEIsSubscribed() can read back whether it did.
    bleTxDescriptor = new BLE2902();
    bleTxCharacteristic->addDescriptor(bleTxDescriptor);

    service->start();

    BLEAdvertising *advertising = BLEDevice::getAdvertising();
    advertising->addServiceUUID(SERVICE_UUID);
    advertising->setScanResponse(true);
    advertising->start();

    Serial.println("Bluetooth is on...");
}

#endif
