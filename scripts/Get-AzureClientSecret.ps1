# Get-AzureClientSecret.ps1
# This script creates a new client secret for an existing Azure AD application
# Prerequisites: Azure PowerShell module or Azure CLI

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId = "ClientId ",
    
    [Parameter(Mandatory=$true)]
    [string]$ClientId = "ClientId ",
    
    [Parameter(Mandatory=$false)]
    [string]$SecretDescription = "SimpleAdminReporter Secret",
    
    [Parameter(Mandatory=$false)]
    [int]$ExpirationYears = 2
)

Write-Host "Azure AD Client Secret Generator" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Function to check if Azure PowerShell is installed
function Test-AzureModule {
    $module = Get-Module -ListAvailable -Name Az.Accounts
    return $null -ne $module
}

# Function to install/update Azure PowerShell module
function Install-AzureModule {
    Write-Host "Checking Azure PowerShell module..." -ForegroundColor Yellow
    
    # Check if we have the module
    $module = Get-Module -ListAvailable -Name Az.Accounts
    
    if ($null -eq $module) {
        Write-Host "Azure PowerShell module not found. Installing..." -ForegroundColor Yellow
        try {
            # Set PSGallery as trusted repository
            Set-PSRepository -Name 'PSGallery' -InstallationPolicy Trusted
            
            # Install the Az module
            Install-Module -Name Az -Repository PSGallery -Force -AllowClobber -Scope CurrentUser
            Write-Host "Azure PowerShell module installed successfully!" -ForegroundColor Green
        } catch {
            Write-Host "Failed to install Azure PowerShell module: $_" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "Azure PowerShell module found. Version: $($module.Version)" -ForegroundColor Green
        
        # Check if update is needed (optional)
        Write-Host "Checking for updates..." -ForegroundColor Yellow
        try {
            Update-Module -Name Az -Force -ErrorAction SilentlyContinue
            Write-Host "Module updated to latest version." -ForegroundColor Green
        } catch {
            Write-Host "Could not update module, continuing with current version." -ForegroundColor Yellow
        }
    }
    
    # Import the module
    try {
        Import-Module Az.Accounts -Force
        Import-Module Az.Resources -Force
        Write-Host "Azure modules imported successfully!" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "Failed to import Azure modules: $_" -ForegroundColor Red
        return $false
    }
}

# Function to check if Azure CLI is installed
function Test-AzureCLI {
    try {
        $null = az --version 2>&1
        return $true
    } catch {
        return $false
    }
}

# Option 1: Using Azure PowerShell Module
function New-ClientSecretWithPowerShell {
    Write-Host "Using Azure PowerShell to create client secret..." -ForegroundColor Yellow
    
    try {
        # Make sure modules are imported
        Import-Module Az.Accounts -Force -ErrorAction Stop
        Import-Module Az.Resources -Force -ErrorAction Stop
        
        # Clear any existing Azure contexts to avoid conflicts
        Write-Host "Clearing existing Azure contexts..." -ForegroundColor Yellow
        Clear-AzContext -Force -ErrorAction SilentlyContinue
        
        # Connect to Azure with specific tenant
        Write-Host "Please sign in to Azure..." -ForegroundColor Green
        Write-Host "Tenant ID: $TenantId" -ForegroundColor Cyan
        
        # Try different connection methods
        $connected = $false
        try {
            # Method 1: Direct tenant connection
            $context = Connect-AzAccount -TenantId $TenantId -ErrorAction Stop
            $connected = $true
        } catch {
            Write-Host "First connection method failed, trying alternative..." -ForegroundColor Yellow
            try {
                # Method 2: Connection without tenant (will prompt for tenant selection)
                $context = Connect-AzAccount -ErrorAction Stop
                # Then select the tenant
                Set-AzContext -TenantId $TenantId -ErrorAction Stop
                $connected = $true
            } catch {
                Write-Host "Connection failed: $_" -ForegroundColor Red
            }
        }
        
        if (-not $connected) {
            throw "Failed to connect to Azure AD"
        }
        
        Write-Host "Successfully connected to Azure!" -ForegroundColor Green
        
        # Create the secret
        $endDate = (Get-Date).AddYears($ExpirationYears)
        $secretName = "$SecretDescription $(Get-Date -Format 'yyyy-MM-dd')"
        
        Write-Host "Creating new client secret..." -ForegroundColor Yellow
        Write-Host "Application ID: $ClientId" -ForegroundColor Cyan
        Write-Host "Secret Name: $secretName" -ForegroundColor Cyan
        Write-Host "Expiration: $endDate" -ForegroundColor Cyan
        
        # Create credential using newer method
        $secretCredential = @{
            displayName = $secretName
            endDateTime = $endDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
        }
        
        # Try to create the secret
        try {
            # First, check if the app exists
            Write-Host "Verifying application exists..." -ForegroundColor Yellow
            $app = Get-AzADApplication -ApplicationId $ClientId -ErrorAction Stop
            if ($null -eq $app) {
                throw "Application with ID $ClientId not found"
            }
            Write-Host "Application found: $($app.DisplayName)" -ForegroundColor Green
            
            # Create the secret using the newer cmdlet
            $secret = New-AzADAppCredential -ApplicationId $ClientId `
                -DisplayName $secretName `
                -EndDate $endDate `
                -ErrorAction Stop
        } catch {
            Write-Host "Error creating secret with New-AzADAppCredential, trying alternative method..." -ForegroundColor Yellow
            
            # Alternative: Use Add-AzADAppCredential
            try {
                $secret = Add-AzADAppCredential -ApplicationId $ClientId `
                    -DisplayName $secretName `
                    -EndDate $endDate `
                    -ErrorAction Stop
            } catch {
                throw "Failed to create secret: $_"
            }
        }
        
        Write-Host ""
        Write-Host "SUCCESS! New client secret created:" -ForegroundColor Green
        Write-Host "=====================================" -ForegroundColor Green
        Write-Host "Secret Value: $($secret.SecretText)" -ForegroundColor Yellow
        Write-Host "Secret ID: $($secret.KeyId)" -ForegroundColor Cyan
        Write-Host "Expires: $endDate" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "IMPORTANT: Copy this secret value now! It cannot be retrieved later." -ForegroundColor Red
        Write-Host ""
        
        # Copy to clipboard if possible
        try {
            $secret.SecretText | Set-Clipboard
            Write-Host "Secret has been copied to clipboard!" -ForegroundColor Green
        } catch {
            Write-Host "Could not copy to clipboard. Please copy manually." -ForegroundColor Yellow
        }
        
        return $secret.SecretText
        
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
        return $null
    }
}

# Option 2: Using Azure CLI
function New-ClientSecretWithCLI {
    Write-Host "Using Azure CLI to create client secret..." -ForegroundColor Yellow
    
    try {
        # Login to Azure
        Write-Host "Please sign in to Azure..." -ForegroundColor Green
        az login --tenant $TenantId
        
        # Create the secret
        $endDate = (Get-Date).AddYears($ExpirationYears).ToString("yyyy-MM-dd")
        
        Write-Host "Creating new client secret..." -ForegroundColor Yellow
        $result = az ad app credential reset `
            --id $ClientId `
            --append `
            --display-name "$SecretDescription $(Get-Date -Format 'yyyy-MM-dd')" `
            --years $ExpirationYears `
            --query password `
            --output tsv
        
        if ($result) {
            Write-Host ""
            Write-Host "SUCCESS! New client secret created:" -ForegroundColor Green
            Write-Host "=====================================" -ForegroundColor Green
            Write-Host "Secret Value: $result" -ForegroundColor Yellow
            Write-Host "Expires: $endDate" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "IMPORTANT: Copy this secret value now! It cannot be retrieved later." -ForegroundColor Red
            Write-Host ""
            
            # Copy to clipboard if possible
            try {
                $result | Set-Clipboard
                Write-Host "Secret has been copied to clipboard!" -ForegroundColor Green
            } catch {
                Write-Host "Could not copy to clipboard. Please copy manually." -ForegroundColor Yellow
            }
            
            return $result
        } else {
            throw "Failed to create secret"
        }
        
    } catch {
        Write-Host "Error: $_" -ForegroundColor Red
        return $null
    }
}

# Option 3: Manual instructions
function Show-ManualInstructions {
    Write-Host ""
    Write-Host "Manual Instructions to Create Client Secret:" -ForegroundColor Cyan
    Write-Host "===========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Go to: https://portal.azure.com" -ForegroundColor White
    Write-Host "2. Navigate to: Azure Active Directory > App registrations" -ForegroundColor White
    Write-Host "3. Find your app with Client ID: $ClientId" -ForegroundColor White
    Write-Host "4. Click on 'Certificates & secrets' in the left menu" -ForegroundColor White
    Write-Host "5. Click 'New client secret'" -ForegroundColor White
    Write-Host "6. Add description: '$SecretDescription'" -ForegroundColor White
    Write-Host "7. Select expiration: $ExpirationYears years" -ForegroundColor White
    Write-Host "8. Click 'Add'" -ForegroundColor White
    Write-Host "9. IMMEDIATELY copy the Value (not the Secret ID)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The secret value will look something like:" -ForegroundColor Gray
    Write-Host "8Q~8Q~iKlmnOPQRsTuVwXyZ.aBcDeFgHiJkLmN" -ForegroundColor Gray
    Write-Host ""
}

# Main execution
Write-Host "Tenant ID: $TenantId" -ForegroundColor Cyan
Write-Host "Client ID: $ClientId" -ForegroundColor Cyan
Write-Host ""

# First, ensure Azure PowerShell module is installed
$moduleInstalled = Install-AzureModule
if (-not $moduleInstalled) {
    Write-Host "Failed to install/import Azure PowerShell module." -ForegroundColor Red
    Write-Host "Please install it manually:" -ForegroundColor Yellow
    Write-Host "  Install-Module -Name Az -Repository PSGallery -Force -Scope CurrentUser" -ForegroundColor White
    Show-ManualInstructions
    exit 1
}

# Check available tools
$hasAzModule = Test-AzureModule
$hasAzCLI = Test-AzureCLI

if (-not $hasAzModule -and -not $hasAzCLI) {
    Write-Host "Neither Azure PowerShell nor Azure CLI is installed." -ForegroundColor Red
    Write-Host ""
    Write-Host "Installation Options:" -ForegroundColor Yellow
    Write-Host "1. Install Azure PowerShell:" -ForegroundColor White
    Write-Host "   Install-Module -Name Az -Repository PSGallery -Force" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Install Azure CLI:" -ForegroundColor White
    Write-Host "   Download from: https://aka.ms/installazurecliwindows" -ForegroundColor Gray
    Write-Host ""
    
    Show-ManualInstructions
    exit 1
}

# Prompt user for method
Write-Host "Available methods to create client secret:" -ForegroundColor Yellow
$methods = @()
if ($hasAzModule) { $methods += "1. Azure PowerShell Module" }
if ($hasAzCLI) { $methods += "2. Azure CLI" }
$methods += "3. Show manual instructions"

foreach ($method in $methods) {
    Write-Host $method -ForegroundColor White
}

Write-Host ""
$choice = Read-Host "Select method (1-3)"

$secret = $null
switch ($choice) {
    "1" {
        if ($hasAzModule) {
            $secret = New-ClientSecretWithPowerShell
        } else {
            Write-Host "Azure PowerShell not available" -ForegroundColor Red
        }
    }
    "2" {
        if ($hasAzCLI) {
            $secret = New-ClientSecretWithCLI
        } else {
            Write-Host "Azure CLI not available" -ForegroundColor Red
        }
    }
    "3" {
        Show-ManualInstructions
    }
    default {
        Write-Host "Invalid choice" -ForegroundColor Red
        Show-ManualInstructions
    }
}

# Update .env file if secret was created
if ($secret) {
    Write-Host ""
    $updateEnv = Read-Host "Would you like to update the .env file automatically? (Y/N)"
    
    if ($updateEnv -eq 'Y' -or $updateEnv -eq 'y') {
        $envPath = Join-Path $PSScriptRoot ".." ".env"
        if (Test-Path $envPath) {
            try {
                $envContent = Get-Content $envPath
                $envContent = $envContent -replace "AZURE_CLIENT_SECRET=.*", "AZURE_CLIENT_SECRET=$secret"
                Set-Content -Path $envPath -Value $envContent
                Write-Host ".env file updated successfully!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Next steps:" -ForegroundColor Cyan
                Write-Host "1. Rebuild the frontend container:" -ForegroundColor White
                Write-Host "   docker-compose build frontend" -ForegroundColor Gray
                Write-Host "2. Restart the containers:" -ForegroundColor White
                Write-Host "   docker-compose up -d" -ForegroundColor Gray
            } catch {
                Write-Host "Error updating .env file: $_" -ForegroundColor Red
                Write-Host "Please update AZURE_CLIENT_SECRET manually in the .env file" -ForegroundColor Yellow
            }
        } else {
            Write-Host ".env file not found at: $envPath" -ForegroundColor Red
            Write-Host "Please update AZURE_CLIENT_SECRET manually in your .env file" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Script completed!" -ForegroundColor Green