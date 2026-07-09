rm -rf dist

npm run build

scp -i $HOME/aws-vps-key.pem -r dist/* ubuntu@3.224.199.228:/var/www/dting.online/