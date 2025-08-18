#!/bin/bash

# Simple test runner to work around the "2" parameter issue

echo "Running backend tests..."
./node_modules/.bin/jest --coverage --maxWorkers=2 "$@"