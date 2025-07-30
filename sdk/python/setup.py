"""
Setup configuration for PUO Memo Python SDK
"""

from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="puomemo",
    version="1.0.0",
    author="PUO Memo Team",
    author_email="support@puomemo.com",
    description="Official Python SDK for PUO Memo API",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/puomemo/python-sdk",
    packages=find_packages(),
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=[
        "httpx>=0.25.0",
        "pydantic>=2.0.0",
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "pytest-asyncio>=0.21.0",
            "pytest-cov>=4.0.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
            "mypy>=1.0.0",
        ]
    },
    keywords="puomemo api sdk memory semantic-search",
    project_urls={
        "Documentation": "https://docs.puomemo.com/sdk/python",
        "Source": "https://github.com/puomemo/python-sdk",
        "Tracker": "https://github.com/puomemo/python-sdk/issues",
    },
)