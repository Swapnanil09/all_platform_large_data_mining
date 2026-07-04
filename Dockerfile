# Use official Python runtime as a parent image
FROM python:3.10-slim

# Create a non-root user with UID 1000 (required by Hugging Face Spaces)
RUN useradd -m -u 1000 user

# Set the working directory
WORKDIR /app

# Copy requirements and install them
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application files and set ownership to the 'user'
COPY --chown=user . .

# Ensure the workdir is owned by the non-root user so it can create connections.json
RUN chown user:user /app

# Use the non-root user
USER user

# Set up environment variables
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# Hugging Face Spaces expects the container to listen on port 7860
EXPOSE 7860

# Start FastAPI application
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
