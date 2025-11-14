#!/bin/sh
set -e

echo "Starting CDC initialization..."

# Configuration
PD_ADDR="http://pd:2379"
KAFKA_ADDR="kafka:29092"
CHANGEFEED_ID="tidb-kafka-changefeed"
MAX_RETRIES=30
RETRY_INTERVAL=2

# Function to check if PD is ready
wait_for_pd() {
    echo "Waiting for PD to be ready..."
    for i in $(seq 1 $MAX_RETRIES); do
        if wget -q --spider "$PD_ADDR/pd/api/v1/health" 2>/dev/null; then
            echo "PD is ready!"
            return 0
        fi
        echo "Attempt $i/$MAX_RETRIES: PD not ready yet..."
        sleep $RETRY_INTERVAL
    done
    echo "ERROR: PD failed to become ready after $MAX_RETRIES attempts"
    exit 1
}

# Function to check if TiCDC is ready
wait_for_ticdc() {
    echo "Waiting for TiCDC to be ready..."
    for i in $(seq 1 $MAX_RETRIES); do
        if wget -q --spider "http://ticdc:8300/status" 2>/dev/null; then
            echo "TiCDC is ready!"
            return 0
        fi
        echo "Attempt $i/$MAX_RETRIES: TiCDC not ready yet..."
        sleep $RETRY_INTERVAL
    done
    echo "ERROR: TiCDC failed to become ready after $MAX_RETRIES attempts"
    exit 1
}

# Function to check if Kafka is ready
wait_for_kafka() {
    echo "Waiting for Kafka to be ready..."
    for i in $(seq 1 $MAX_RETRIES); do
        if nc -z kafka 29092 2>/dev/null; then
            echo "Kafka is ready!"
            return 0
        fi
        echo "Attempt $i/$MAX_RETRIES: Kafka not ready yet..."
        sleep $RETRY_INTERVAL
    done
    echo "ERROR: Kafka failed to become ready after $MAX_RETRIES attempts"
    exit 1
}

# Function to check if changefeed exists
changefeed_exists() {
    /cdc cli changefeed list --pd="$PD_ADDR" 2>/dev/null | grep -q "$CHANGEFEED_ID"
}

# Function to create changefeed
create_changefeed() {
    echo "Creating changefeed: $CHANGEFEED_ID"
    /cdc cli changefeed create \
        --pd="$PD_ADDR" \
        --sink-uri="kafka://$KAFKA_ADDR/tidb-cdc?protocol=canal-json" \
        --changefeed-id="$CHANGEFEED_ID"
    
    if [ $? -eq 0 ]; then
        echo "✓ Changefeed created successfully!"
        return 0
    else
        echo "✗ Failed to create changefeed"
        return 1
    fi
}

# Function to verify changefeed is running
verify_changefeed() {
    echo "Verifying changefeed status..."
    CHANGEFEED_INFO=$(/cdc cli changefeed query --pd="$PD_ADDR" --changefeed-id="$CHANGEFEED_ID" 2>/dev/null)
    
    if echo "$CHANGEFEED_INFO" | grep -q '"state": "normal"'; then
        echo "✓ Changefeed is running normally"
        return 0
    else
        echo "⚠ Changefeed exists but may not be in normal state"
        echo "$CHANGEFEED_INFO"
        return 1
    fi
}

# Main execution
main() {
    echo "=========================================="
    echo "TiCDC Changefeed Initialization"
    echo "=========================================="
    
    # Wait for all dependencies
    wait_for_pd
    wait_for_ticdc
    wait_for_kafka
    
    echo ""
    echo "All services are ready. Checking changefeed status..."
    echo ""
    
    # Check if changefeed already exists
    if changefeed_exists; then
        echo "ℹ Changefeed '$CHANGEFEED_ID' already exists"
        verify_changefeed
        echo ""
        echo "=========================================="
        echo "Initialization complete (existing changefeed)"
        echo "=========================================="
        exit 0
    fi
    
    # Create new changefeed
    echo "Changefeed does not exist. Creating new changefeed..."
    if create_changefeed; then
        sleep 3  # Give it time to start
        verify_changefeed
        echo ""
        echo "=========================================="
        echo "Initialization complete (new changefeed created)"
        echo "=========================================="
        exit 0
    else
        echo ""
        echo "=========================================="
        echo "Initialization FAILED"
        echo "=========================================="
        exit 1
    fi
}

main