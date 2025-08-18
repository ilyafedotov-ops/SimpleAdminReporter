#!/bin/bash

# SSL Certificate Generation Script for SimpleAdminReporter
# This script generates self-signed certificates for development/internal use

set -e

SSL_DIR="./ssl"
CERT_FILE="$SSL_DIR/app.crt"
KEY_FILE="$SSL_DIR/app.key"
CONFIG_FILE="$SSL_DIR/openssl.conf"

echo "🔐 Generating SSL certificates for SimpleAdminReporter..."

# Create SSL directory
mkdir -p "$SSL_DIR"

# Create OpenSSL configuration for SAN (Subject Alternative Names)
cat > "$CONFIG_FILE" << EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=US
ST=Local
L=Local
O=SimpleAdminReporter
OU=Development
CN=localhost

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Generate private key
echo "📝 Generating private key..."
openssl genrsa -out "$KEY_FILE" 2048

# Generate certificate signing request and self-signed certificate
echo "📄 Generating self-signed certificate..."
openssl req -new -x509 -key "$KEY_FILE" -out "$CERT_FILE" -days 365 -config "$CONFIG_FILE" -extensions v3_req

# Set proper permissions
chmod 600 "$KEY_FILE"
chmod 644 "$CERT_FILE"

echo "✅ SSL certificates generated successfully!"
echo "   Certificate: $CERT_FILE"
echo "   Private Key: $KEY_FILE"
echo "   Valid for: 365 days"
echo ""
echo "📋 Certificate details:"
openssl x509 -in "$CERT_FILE" -text -noout | grep -A 3 "Subject Alternative Name"

echo ""
echo "🚀 Next steps:"
echo "   1. Restart the application: docker-compose restart"
echo "   2. Access https://localhost (accept certificate in browser)"
echo "   3. For production, replace with proper CA-signed certificates"