# Create-AzureSecret-Simple.ps1
# Simplified script to create Azure AD client secret with proper module handling

param(
    [string]$TenantId = ".............................",
    [string]$ClientId = "............................."
)

Write-Host "`nAzure AD Client Secret Generator (Simplified)" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Tenant ID: $TenantId" -ForegroundColor Yellow
Write-Host "Client ID: $ClientId" -ForegroundColor Yellow
Write-Host ""

# Step 1: Install/Update Azure PowerShell Module
Write-Host "Step 1: Checking Azure PowerShell Module..." -ForegroundColor Green
try {
    # Check if module exists
    if (!(Get-Module -ListAvailable -Name Az.Accounts)) {
        Write-Host "Installing Azure PowerShell module (this may take a few minutes)..." -ForegroundColor Yellow
        
        # Ensure NuGet provider is installed
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -ErrorAction SilentlyContinue
        
        # Set PSGallery as trusted
        Set-PSRepository -Name 'PSGallery' -InstallationPolicy Trusted
        
        # Install Az module
        Install-Module -Name Az -Repository PSGallery -Force -AllowClobber -Scope CurrentUser
        Write-Host "Module installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Azure PowerShell module is already installed." -ForegroundColor Green
    }
    
    # Import required modules
    Import-Module Az.Accounts -Force
    Import-Module Az.Resources -Force
    Write-Host "Modules imported successfully!" -ForegroundColor Green
} catch {
    Write-Host "Error with module setup: $_" -ForegroundColor Red
    Write-Host "`nPlease run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

# Step 2: Connect to Azure
Write-Host "`nStep 2: Connecting to Azure AD..." -ForegroundColor Green
try {
    # Clear any existing connections
    Disconnect-AzAccount -ErrorAction SilentlyContinue | Out-Null
    Clear-AzContext -Force -ErrorAction SilentlyContinue | Out-Null
    
    Write-Host "Please sign in with an account that has permission to manage the application." -ForegroundColor Yellow
    $context = Connect-AzAccount -TenantId $TenantId
    
    Write-Host "Successfully connected to Azure!" -ForegroundColor Green
    Write-Host "Signed in as: $($context.Context.Account.Id)" -ForegroundColor Cyan
} catch {
    Write-Host "Failed to connect to Azure: $_" -ForegroundColor Red
    Write-Host "`nMake sure:" -ForegroundColor Yellow
    Write-Host "1. The Tenant ID is correct" -ForegroundColor White
    Write-Host "2. You have access to this tenant" -ForegroundColor White
    Write-Host "3. Your account has permission to manage applications" -ForegroundColor White
    exit 1
}

# Step 3: Verify Application Exists
Write-Host "`nStep 3: Verifying application..." -ForegroundColor Green
try {
    $app = Get-AzADApplication -ApplicationId $ClientId
    if ($null -eq $app) {
        throw "Application not found"
    }
    Write-Host "Found application: $($app.DisplayName)" -ForegroundColor Green
} catch {
    Write-Host "Application with ID $ClientId not found in tenant!" -ForegroundColor Red
    Write-Host "`nMake sure:" -ForegroundColor Yellow
    Write-Host "1. The Client ID is correct" -ForegroundColor White
    Write-Host "2. The application exists in this tenant" -ForegroundColor White
    Write-Host "3. You have permission to view the application" -ForegroundColor White
    exit 1
}

# Step 4: Create Client Secret
Write-Host "`nStep 4: Creating client secret..." -ForegroundColor Green
try {
    $endDate = (Get-Date).AddYears(2)
    $secretName = "SimpleAdminReporter $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    
    # Create the secret
    $credential = New-AzADAppCredential `
        -ApplicationId $ClientId `
        -DisplayName $secretName `
        -EndDate $endDate
    
    # Display the secret
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "SUCCESS! Client secret created!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Client Secret Value:" -ForegroundColor Yellow
    Write-Host $credential.SecretText -ForegroundColor Cyan -BackgroundColor DarkGray
    Write-Host ""
    Write-Host "Secret ID: $($credential.KeyId)" -ForegroundColor White
    Write-Host "Expires: $endDate" -ForegroundColor White
    Write-Host ""
    Write-Host "IMPORTANT: Copy this secret now! It cannot be retrieved later." -ForegroundColor Red
    Write-Host ""
    
    # Try to copy to clipboard
    try {
        $credential.SecretText | Set-Clipboard
        Write-Host "Secret copied to clipboard!" -ForegroundColor Green
    } catch {
        Write-Host "Could not copy to clipboard automatically." -ForegroundColor Yellow
    }
    
    # Offer to update .env file
    Write-Host ""
    $response = Read-Host "Update .env file with this secret? (Y/N)"
    if ($response -eq 'Y' -or $response -eq 'y') {
        $envPath = Join-Path (Split-Path $PSScriptRoot) ".env"
        if (Test-Path $envPath) {
            $content = Get-Content $envPath
            $content = $content -replace "AZURE_CLIENT_SECRET=.*", "AZURE_CLIENT_SECRET=$($credential.SecretText)"
            Set-Content $envPath $content
            Write-Host ".env file updated successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Next steps:" -ForegroundColor Cyan
            Write-Host "1. cd to project root" -ForegroundColor White
            Write-Host "2. docker-compose build frontend" -ForegroundColor White
            Write-Host "3. docker-compose up -d" -ForegroundColor White
        } else {
            Write-Host "Could not find .env file at: $envPath" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "Failed to create secret: $_" -ForegroundColor Red
    Write-Host "`nPossible issues:" -ForegroundColor Yellow
    Write-Host "1. You don't have permission to manage this application" -ForegroundColor White
    Write-Host "2. The application is managed by another service" -ForegroundColor White
    Write-Host "3. Maximum number of secrets reached (consider removing old ones)" -ForegroundColor White
    exit 1
}

Write-Host "`nScript completed successfully!" -ForegroundColor Green