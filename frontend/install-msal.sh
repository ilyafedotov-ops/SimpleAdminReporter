#!/bin/bash

# Install MSAL Browser and React packages
echo "Installing MSAL packages for frontend..."

cd /home/ilya/projects/SimpleAdminReporter/frontend

# Install MSAL browser and react packages
npm install @azure/msal-browser@^3.10.0 @azure/msal-react@^2.0.13

echo "MSAL packages installed successfully!"
echo "Packages installed:"
echo "- @azure/msal-browser"
echo "- @azure/msal-react"