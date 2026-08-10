variable "location" {
  default = "spaincentral"
}

variable "admin_username" {
  default = "azureuser"
}

variable "ssh_public_key_path" {
  default = "~/.ssh/id_rsa.pub"
}

variable "vm_size" {
  default = "Standard_B2als_v2"   # 2 vCPU / 4GB RAM — enough for k3s + ArgoCD + runner
}

variable "my_ip" {
  description = "Your public IP, so SSH is only open to you. Get it with: curl ifconfig.me"
  type        = string
}
