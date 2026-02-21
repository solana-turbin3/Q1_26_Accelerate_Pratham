use anchor_lang::AccountDeserialize;

use super::helper::*;

#[test]
fn test_add_user() {
    let (mut svm, admin) = setup();
    let (vault_pda, _mint_kp, _mint_pk) = do_initialize(&mut svm, &admin);

    let user_pk = anchor_lang::prelude::Pubkey::new_unique();
    let user_account_pda = do_add_user(&mut svm, &admin, &vault_pda, &user_pk);

    let user_acc = svm.get_account(&pubkey_to_addr(&user_account_pda)).unwrap();
    let user_data =
        crate::state::UserAccount::try_deserialize(&mut user_acc.data.as_ref()).unwrap();

    assert_eq!(user_data.account, user_pk);
    assert_eq!(user_data.amount, 0);
}
