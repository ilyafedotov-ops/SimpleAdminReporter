#!/bin/bash

# AD Reporting Application - Bashrc Additions
# Add these lines to your ~/.bashrc or ~/.zshrc file

# Auto-start Docker if not running (optional)
if command -v docker &> /dev/null; then
    if [ -z "$(ps aux | grep dockerd | grep -v grep)" ]; then
        echo "Starting Docker service..."
        sudo service docker start &> /dev/null
    fi
fi

# Display WSL network information for AD Reporting App
if [ -d "/home/ilya/projects/SimpleAdminReporter" ]; then
    WSL_IP=$(hostname -I | awk '{print $1}')
    if [ -n "$WSL_IP" ]; then
        echo ""
        echo "╔════════════════════════════════════════════════════════╗"
        echo "║         AD Reporting Application - WSL Access          ║"
        echo "╠════════════════════════════════════════════════════════╣"
        echo "║ WSL IP: $WSL_IP"
        echo "║"
        echo "║ Access from Windows Browser:"
        echo "║   • http://$WSL_IP       (Full App via Nginx)"
        echo "║   • http://$WSL_IP:3000  (Frontend Direct)"
        echo "║   • http://$WSL_IP:5000  (Backend API)"
        echo "║"
        echo "║ Quick Commands:"
        echo "║   • cd /home/ilya/projects/SimpleAdminReporter"
        echo "║   • docker-compose up -d    (Start all services)"
        echo "║   • docker-compose ps       (Check status)"
        echo "║   • ./scripts/wsl-network-info.sh (Full network info)"
        echo "╚════════════════════════════════════════════════════════╝"
        echo ""
    fi
fi

# Alias for quick project access
alias adreport='cd /home/ilya/projects/SimpleAdminReporter'
alias adreport-up='cd /home/ilya/projects/SimpleAdminReporter && docker-compose up -d'
alias adreport-down='cd /home/ilya/projects/SimpleAdminReporter && docker-compose down'
alias adreport-logs='cd /home/ilya/projects/SimpleAdminReporter && docker-compose logs -f'
alias adreport-status='cd /home/ilya/projects/SimpleAdminReporter && docker-compose ps'
alias adreport-network='cd /home/ilya/projects/SimpleAdminReporter && ./scripts/wsl-network-info.sh'