FROM python:3.11-slim

WORKDIR /app

# System dependencies for OpenCV, PaddleOCR, and pyzbar
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libzbar0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Models directory (mount or bake in)
RUN mkdir -p models

EXPOSE 8100

ENV IDV_AI_PORT=8100

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
