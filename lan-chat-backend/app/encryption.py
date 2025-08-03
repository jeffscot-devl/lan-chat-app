from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import base64
import os
from typing import Tuple

class EncryptionManager:
    def __init__(self):
        self.master_key = self._get_or_create_master_key()
        
    def _get_or_create_master_key(self) -> bytes:
        key_file = "master.key"
        if os.path.exists(key_file):
            with open(key_file, "rb") as f:
                return f.read()
        else:
            key = Fernet.generate_key()
            with open(key_file, "wb") as f:
                f.write(key)
            return key
    
    def generate_user_keypair(self) -> Tuple[str, str]:
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        public_key = private_key.public_key()
        public_pem = public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        return public_pem.decode('utf-8'), private_pem.decode('utf-8')
    
    def encrypt_message(self, message: str, recipient_public_key: str) -> str:
        public_key = serialization.load_pem_public_key(recipient_public_key.encode('utf-8'))
        
        symmetric_key = Fernet.generate_key()
        fernet = Fernet(symmetric_key)
        
        encrypted_message = fernet.encrypt(message.encode('utf-8'))
        
        encrypted_key = public_key.encrypt(
            symmetric_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        combined = base64.b64encode(encrypted_key).decode('utf-8') + ":" + base64.b64encode(encrypted_message).decode('utf-8')
        return combined
    
    def decrypt_message(self, encrypted_data: str, private_key: str) -> str:
        try:
            encrypted_key_b64, encrypted_message_b64 = encrypted_data.split(":", 1)
            
            encrypted_key = base64.b64decode(encrypted_key_b64)
            encrypted_message = base64.b64decode(encrypted_message_b64)
            
            private_key_obj = serialization.load_pem_private_key(
                private_key.encode('utf-8'),
                password=None,
            )
            
            symmetric_key = private_key_obj.decrypt(
                encrypted_key,
                padding.OAEP(
                    mgf=padding.MGF1(algorithm=hashes.SHA256()),
                    algorithm=hashes.SHA256(),
                    label=None
                )
            )
            
            fernet = Fernet(symmetric_key)
            decrypted_message = fernet.decrypt(encrypted_message)
            
            return decrypted_message.decode('utf-8')
        except Exception as e:
            raise ValueError(f"Failed to decrypt message: {str(e)}")
    
    def encrypt_group_message(self, message: str, group_key: str) -> str:
        fernet = Fernet(group_key.encode('utf-8'))
        encrypted = fernet.encrypt(message.encode('utf-8'))
        return base64.b64encode(encrypted).decode('utf-8')
    
    def decrypt_group_message(self, encrypted_message: str, group_key: str) -> str:
        try:
            fernet = Fernet(group_key.encode('utf-8'))
            encrypted_data = base64.b64decode(encrypted_message)
            decrypted = fernet.decrypt(encrypted_data)
            return decrypted.decode('utf-8')
        except Exception as e:
            raise ValueError(f"Failed to decrypt group message: {str(e)}")
    
    def generate_group_key(self) -> str:
        return Fernet.generate_key().decode('utf-8')
    
    def encrypt_private_key(self, private_key: str, user_password: str) -> str:
        salt = os.urandom(16)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(user_password.encode()))
        
        fernet = Fernet(key)
        encrypted_key = fernet.encrypt(private_key.encode('utf-8'))
        
        combined = base64.b64encode(salt).decode('utf-8') + ":" + base64.b64encode(encrypted_key).decode('utf-8')
        return combined
    
    def decrypt_private_key(self, encrypted_private_key: str, user_password: str) -> str:
        try:
            salt_b64, encrypted_key_b64 = encrypted_private_key.split(":", 1)
            salt = base64.b64decode(salt_b64)
            encrypted_key = base64.b64decode(encrypted_key_b64)
            
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=100000,
            )
            key = base64.urlsafe_b64encode(kdf.derive(user_password.encode()))
            
            fernet = Fernet(key)
            private_key = fernet.decrypt(encrypted_key)
            
            return private_key.decode('utf-8')
        except Exception as e:
            raise ValueError(f"Failed to decrypt private key: {str(e)}")

encryption_manager = EncryptionManager()
