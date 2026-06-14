FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Create templates and static directories if they don't copy over
RUN mkdir -p templates static

# Expose Flask default port
EXPOSE 5000

# Start Flask using Gunicorn for production-grade serving
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]
