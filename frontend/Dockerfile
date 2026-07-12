FROM nginx:alpine

# Remove default nginx static files
RUN rm -rf /usr/share/nginx/html/*

# Copy our static frontend files into nginx's web root
COPY . /usr/share/nginx/html

EXPOSE 80