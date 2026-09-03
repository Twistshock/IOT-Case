# Requirements and Libraries

## Third-Party Dependencies

```text
paho-mqtt==2.1.0
```

* **Paho MQTT** — MQTT client library.
* Used to connect to MQTT brokers and **publish/subscribe** to MQTT topics.
* Commonly used for IoT, messaging, and event-driven applications.

```text
psycopg[binary]==3.2.9
```

* **Psycopg 3** — PostgreSQL database adapter for Python.
* Used to connect to PostgreSQL and execute SQL queries.
* The `[binary]` extra provides binary components for easier installation and improved performance.

```text
argon2-cffi==23.1.0
```

* **Argon2-CFFI** — Python bindings for the Argon2 password-hashing algorithm.
* Used for securely hashing and verifying passwords.
* Argon2 is designed to resist brute-force and GPU-based password attacks.

```text
fastapi==0.116.1
```

* **FastAPI** — modern Python web framework for building APIs.
* Provides routing, request/response handling, validation, and automatic API documentation.
* Built around Python type hints and commonly used with Pydantic.

```text
uvicorn[standard]==0.35.0
```

* **Uvicorn** — ASGI web server for running FastAPI and other ASGI applications.
* The `[standard]` extra installs additional recommended performance and development dependencies.
* Typically used to start a FastAPI application in production or development.

---

# Python Standard Library

```python
from __future__ import annotations
```

* Enables **postponed evaluation of type annotations**.
* Allows type hints to be evaluated later rather than immediately.
* Useful for forward references and modern type-hinting patterns.

```python
import hmac
```

* Provides **HMAC (Hash-based Message Authentication Code)** functionality.
* Used to authenticate and verify messages using a shared secret.
* Useful when message integrity and authenticity need to be verified.

```python
import json
```

* Provides encoding and decoding of **JSON data**.
* Commonly used for API payloads, MQTT messages, configuration data, and database-related data exchange.

```python
import os
```

* Provides operating-system interfaces.
* Common uses include reading environment variables, accessing files, and interacting with the host operating system.

```python
import re
```

* Provides **regular expression** functionality.
* Used for searching, validating, extracting, and replacing text patterns.

```python
import hashlib
```

* Provides secure hashing algorithms such as SHA-256 and SHA-512.
* Useful for checksums, fingerprints, and non-password cryptographic hashing.

```python
import threading
```

* Provides support for **threads and concurrent execution**.
* Useful for running background or blocking operations without blocking the main application thread.

```python
from datetime import date, datetime, timezone
```

* Provides date and time functionality.
* `date` — represents a calendar date.
* `datetime` — represents a date and time.
* `timezone` — provides timezone information, commonly used for UTC-aware timestamps.

```python
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
```

* Provides a lightweight HTTP server from Python's standard library.
* `BaseHTTPRequestHandler` — base class for handling HTTP requests.
* `ThreadingHTTPServer` — HTTP server capable of handling requests concurrently using threads.

```python
from typing import Any
```

* Provides Python **type-hinting utilities**.
* `Any` indicates that a value may contain a value of any type.

```python
from uuid import UUID
```

* Provides support for **UUID (Universally Unique Identifier)** values.
* `UUID` can be used to represent and validate unique identifiers commonly used for users, devices, records, and transactions.