#!/bin/bash
# get-azure-secret.sh
# Creates a new client secret for an Azure AD application using Azure CLI

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values from .env
TENANT_ID="${1:-....................................}"
CLIENT_ID="${2:-........................}"
SECRET_DESCRIPTION="${3:-SimpleAdminReporter Secret}"
EXPIRATION_YEARS="${4:-2}"

echo -e "${CYAN}Azure AD Client Secret Generator${NC}"
echo -e "${CYAN}================================${NC}"
echo ""
echo -e "${CYAN}Tenant ID:${NC} $TENANT_ID"
echo -e "${CYAN}Client ID:${NC} $CLIENT_ID"
echo ""

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo -e "${RED}Azure CLI is not installed!${NC}"
    echo ""
    echo -e "${YELLOW}Installation instructions:${NC}"
    echo "For Ubuntu/Debian/WSL:"
    echo -e "${NC}  curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash${NC}"
    echo ""
    echo "For other systems, visit:"
    echo "  https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    echo ""
    echo -e "${CYAN}Manual Instructions:${NC}"
    echo "1. Go to: https://portal.azure.com"
    echo "2. Navigate to: Azure Active Directory > App registrations"
    echo "3. Find your app with Client ID: $CLIENT_ID"
    echo "4. Click on 'Certificates & secrets' in the left menu"
    echo "5. Click 'New client secret'"
    echo "6. Add description: '$SECRET_DESCRIPTION'"
    echo "7. Select expiration: $EXPIRATION_YEARS years"
    echo "8. Click 'Add'"
    echo -e "9. ${YELLOW}IMMEDIATELY copy the Value (not the Secret ID)${NC}"
    exit 1
fi

# Login to Azure
echo -e "${GREEN}Please sign in to Azure...${NC}"
az login --tenant "$TENANT_ID"

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to login to Azure${NC}"
    exit 1
fi

# Create the secret
echo -e "${YELLOW}Creating new client secret...${NC}"
SECRET=$(az ad app credential reset \
    --id "$CLIENT_ID" \
    --append \
    --display-name "$SECRET_DESCRIPTION $(date +%Y-%m-%d)" \
    --years "$EXPIRATION_YEARS" \
    --query password \
    --output tsv 2>/dev/null)

if [ -z "$SECRET" ]; then
    echo -e "${RED}Failed to create client secret${NC}"
    echo "Please check:"
    echo "1. You have the necessary permissions in Azure AD"
    echo "2. The Client ID is correct"
    echo "3. The application exists in your tenant"
    exit 1
fi

# Display the secret
echo ""
echo -e "${GREEN}SUCCESS! New client secret created:${NC}"
echo -e "${GREEN}=====================================${NC}"
echo -e "${YELLOW}Secret Value: $SECRET${NC}"
echo -e "${CYAN}Expires in: $EXPIRATION_YEARS years${NC}"
echo ""
echo -e "${RED}IMPORTANT: Copy this secret value now! It cannot be retrieved later.${NC}"

# Try to copy to clipboard
if command -v xclip &> /dev/null; then
    echo -n "$SECRET" | xclip -selection clipboard
    echo -e "${GREEN}Secret has been copied to clipboard!${NC}"
elif command -v pbcopy &> /dev/null; then
    echo -n "$SECRET" | pbcopy
    echo -e "${GREEN}Secret has been copied to clipboard!${NC}"
elif command -v clip.exe &> /dev/null; then
    echo -n "$SECRET" | clip.exe
    echo -e "${GREEN}Secret has been copied to clipboard!${NC}"
fi

# Ask to update .env file
echo ""
read -p "Would you like to update the .env file automatically? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    ENV_FILE="$SCRIPT_DIR/../.env"
    
    if [ -f "$ENV_FILE" ]; then
        # Create backup
        cp "$ENV_FILE" "$ENV_FILE.backup"
        
        # Update the secret
        if sed -i "s|AZURE_CLIENT_SECRET=.*|AZURE_CLIENT_SECRET=$SECRET|" "$ENV_FILE"; then
            echo -e "${GREEN}.env file updated successfully!${NC}"
            echo -e "${CYAN}Backup saved to: .env.backup${NC}"
            echo ""
            echo -e "${CYAN}Next steps:${NC}"
            echo "1. Rebuild the frontend container:"
            echo "   docker-compose build frontend"
            echo "2. Restart the containers:"
            echo "   docker-compose up -d"
        else
            echo -e "${RED}Failed to update .env file${NC}"
            echo "Please update AZURE_CLIENT_SECRET manually in the .env file"
        fi
    else
        echo -e "${RED}.env file not found at: $ENV_FILE${NC}"
        echo "Please update AZURE_CLIENT_SECRET manually in your .env file"
    fi
fi

echo ""
echo -e "${GREEN}Script completed!${NC}"