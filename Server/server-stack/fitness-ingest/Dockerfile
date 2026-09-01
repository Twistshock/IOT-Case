FROM python:3.12-slim
# Create nologin user for ingesting fitness data
RUN useradd --system --user-group \
        --home-dir /var/lib/fitness-ingest \
        --shell /usr/sbin/nologin \
        fitness \
    && mkdir -p /var/lib/fitness-ingest /opt/fitness-ingest \
    && chown -R fitness:fitness /var/lib/fitness-ingest

WORKDIR /opt/fitness-ingest

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py .
RUN chown fitness:fitness /opt/fitness-ingest/app.py

USER fitness

EXPOSE 8080

CMD ["python", "-u", "app.py"]
