use std::marker::PhantomData;

/// The core Serializer Trait that defines the structure for all implementations.
pub trait Serializer<T> {
    fn to_bytes(&self, data: &T) -> Result<Vec<u8>, String>;
    fn from_bytes(&self, bytes: &[u8]) -> Result<T, String>;
}

/// The generic Storage container.
/// `T` is the type being stored.
/// `S` is the Serializer implementation.
pub struct Storage<T, S>
where
    S: Serializer<T>,
{
    data: Option<Vec<u8>>,
    serializer: S,
    _marker: PhantomData<T>,
}

impl<T, S> Storage<T, S>
where
    S: Serializer<T>,
{
    pub fn new(serializer: S) -> Self {
        Storage {
            data: None,
            serializer,
            _marker: PhantomData,
        }
    }

    pub fn save(&mut self, value: &T) -> Result<(), String> {
        self.data = Some(self.serializer.to_bytes(value)?);
        Ok(())
    }

    pub fn load(&self) -> Result<T, String> {
        let bytes = self.data.as_ref().ok_or("No data stored")?;
        self.serializer.from_bytes(bytes)
    }

    pub fn has_data(&self) -> bool {
        self.data.is_some()
    }
}

// ======================================
// 2. Implement Three Serializers
// ======================================

pub struct BorshSer;
impl<T: borsh::BorshSerialize + borsh::BorshDeserialize> Serializer<T> for BorshSer {
    fn to_bytes(&self, data: &T) -> Result<Vec<u8>, String> {
        borsh::to_vec(data).map_err(|e| e.to_string())
    }

    fn from_bytes(&self, bytes: &[u8]) -> Result<T, String> {
        borsh::from_slice(bytes).map_err(|e| e.to_string())
    }
}

pub struct WincodeSer;
impl<T> Serializer<T> for WincodeSer
where
    T: wincode::SchemaWrite<wincode::config::DefaultConfig, Src = T>
        + for<'a> wincode::SchemaRead<'a, wincode::config::DefaultConfig, Dst = T>,
{
    fn to_bytes(&self, data: &T) -> Result<Vec<u8>, String> {
        wincode::serialize(data).map_err(|e| e.to_string())
    }

    fn from_bytes(&self, bytes: &[u8]) -> Result<T, String> {
        wincode::deserialize(bytes).map_err(|e| e.to_string())
    }
}

pub struct JsonSer;
impl<T: serde::Serialize + serde::de::DeserializeOwned> Serializer<T> for JsonSer {
    fn to_bytes(&self, data: &T) -> Result<Vec<u8>, String> {
        serde_json::to_vec(data).map_err(|e| e.to_string())
    }

    fn from_bytes(&self, bytes: &[u8]) -> Result<T, String> {
        serde_json::from_slice(bytes).map_err(|e| e.to_string())
    }
}

// ======================================
// 5. Test Data Type & 6. Write Tests
// ======================================
#[cfg(test)]
mod tests {
    use super::*;
    use borsh::{BorshDeserialize, BorshSerialize};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, PartialEq, Clone, BorshSerialize, BorshDeserialize, Serialize, Deserialize, wincode::SchemaWrite, wincode::SchemaRead)]
    struct Person {
        pub name: String,
        pub age: u32,
        pub balance: f64,
    }

    #[test]
    fn test_borsh_serialization() {
        let p = Person {
            name: "Andre".to_string(),
            age: 30,
            balance: 500.50,
        };

        let mut storage = Storage::new(BorshSer);
        assert!(!storage.has_data());

        storage.save(&p).unwrap();
        assert!(storage.has_data());

        let loaded = storage.load().unwrap();
        assert_eq!(loaded, p);
    }

    #[test]
    fn test_bincode_serialization() {
        let p = Person {
            name: "Pratham".to_string(),
            age: 22,
            balance: 1000.75,
        };

        // Note: Using Wincode as the standard rust serde binary format for Solana.
        let mut storage = Storage::new(WincodeSer);
        assert!(!storage.has_data());

        storage.save(&p).unwrap();
        assert!(storage.has_data());

        let loaded = storage.load().unwrap();
        assert_eq!(loaded, p);
    }

    #[test]
    fn test_json_serialization() {
        let p = Person {
            name: "Alice".to_string(),
            age: 45,
            balance: 0.05,
        };

        let mut storage = Storage::new(JsonSer);
        assert!(!storage.has_data());

        storage.save(&p).unwrap();
        assert!(storage.has_data());

        let loaded = storage.load().unwrap();
        assert_eq!(loaded, p);
    }
}
